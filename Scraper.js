import PDFJS from 'pdfjs-dist'
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'
import Puppeteer from 'puppeteer';

const MAX_DEPTH = 2

class ScraperLocation {

	constructor(url, exceprt, pageNumber) {
		this.fileURL = url
		this.textExcerpt = exceprt
		this.pageNumber = pageNumber
	}
	static n(url, exceprt, pageNumber) {
		let sl = new ScraperLocation(url, exceprt, pageNumber)
		return sl
	}
	pretty() {
		return `${!!this.pageNumber ? "side " + this.pageNumber + ": " : ""}${this.textExcerpt}`
	}
}

function streamToString(stream) {
	const chunks = [];
	return new Promise((resolve, reject) => {
		stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
		stream.on('error', (err) => reject(err));
		stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	})
}
class Scraper {

	constructor(url, phraseToFind) {
		if (!url || !phraseToFind) {
			console.error("Error: Missing required argument(s)")
			console.error("Usage: node init.js [url] [phrase to find] ")
			process.exit(1)
		}
		this.url = url.split("?")[0].split("#")[0]
		console.log("this.url = ", this.url)
		this.phraseToFind = phraseToFind
		this.locations = []
		this.visitedURLs = []
		this.browser = null
		this.page = null
		this.regex = new RegExp(
			"(.{0,20})" + this.phraseToFind + "(.{0,20})",
			"gi"
		)
	}

	async start() {
		this.browser = await Puppeteer.launch({
			headless: true,
			userDataDir: "dataDir"
		})
		this.page = await this.browser.newPage()
		await this.page.setRequestInterception(true)
		this.page.on('request', (req) => {
			if (req.resourceType() == 'font' || req.resourceType() == 'image' || req.resourceType() == 'stylesheet') {
				req.abort();
			}
			else {
				req.continue();
			}
		})

		await this.getPage(this.url, 0)
		let locs = {}
		for (let loc of this.locations) {
			if (!locs[loc.fileURL]) {
				locs[loc.fileURL] = true
				console.log("\n\n"+loc.fileURL+":")
			}
			console.log(`\t\t${loc.pretty()}`)
		}
		console.log("\nFant totalt " + this.locations.length + " resultater!")
		this.browser.close()
	}

	async getPage(url, depth) {
		var validExtension = false
		let extensions = ["pdf", "html", "/"]
		extensions.forEach((val) => {
			if (val.includes(url.substring(url.length - val.length, url.length))) validExtension = true
		})
		if (!validExtension) {
			//console.log("Skipping page with extension: " + url.substring(url.length - 4, url.length))
			return
		}
		if (depth > MAX_DEPTH) {
			return
		}
		try {
			if (this.visitedURLs.includes(url)) return
			let res = await (await fetch(url)).text()

			let response = await this.page.goto(url, {
				waitUntil: 'networkidle0',
			})
			
			console.log("Was cached? "+ (response.fromCache() ? "\x1b[5m\x1b[32mTRUE\x1b[0m" : "\x1b[2m\x1b[4m\x1b[31mFALSE\x1b[0m"))
			//await this.page.waitForNavigation()
			this.visitedURLs.push(url)
			await this.parsePage(url, res, depth);
		} catch (e) {
			console.error("Got error in getPage: " + e)
			return
		}
	}

	async parsePage(currentURL, _, depth) {


		/* await this.page.evaluate(() => {
			let elements = document.getElementsByClassName('accordion');
			for (let element of elements)
				element.click()
		}); */
		const handles = await this.page.$$('.accordion');
		for (const handle of handles) {
			await handle.evaluate(b => b.click());
		}
		await this.page.waitForNetworkIdle()

		let pageContent = await this.page.$eval("body", el => el.textContent);
		let htmlContent = await this.page.content()
		//console.log(pageContent.replace(/\s/g,''))
		//var regex = new RegExp("\\s?([^\\s]+\\s" + this.phraseToFind + "\\s[^\\s]+)\\s?", "i");

		let matches = pageContent.match(this.regex)

		let dom = new JSDOM(htmlContent)
		//.querySelector("a").textContent
		//Check page for contents

		// console.log(dom.window.document.body.textContent.replace(/\s/g,''))
		// at this point, the line above is the same as: var regex =

		//let matches = "Det som virkelig suger er korona fordi det er det verste som finnes".match(regex)
		//let matches = dom.window.document.body.textContent.match(regex)

		if (!!matches && matches.length > 0) {
			for (let match of matches) {
				let loc = ScraperLocation.n(currentURL, match)
				this.locations.push(loc)
			}
		}

		var allParas = dom.window.document.getElementsByTagName('a')
		for (let param of allParas) {
			//console.log("Found <a> tag!")
			//Only get urls sub page, but not same
			if (!param || !param.getAttribute("href")) {
				continue
			}
			//console.log("Found <a> tag with href: " + param.getAttribute("href").split("?")[0].split("#")[0])
			let url = param.getAttribute("href").split("?")[0].split("#")[0] + ""
			//console.log("slashes: "+this.url.match(/\//g).length)
			let compareURL = currentURL.match(/\//g).length > 2 ? currentURL.substr(0, currentURL.lastIndexOf("/")) : currentURL
			//console.log("includes comp url (" + compareURL + "): "+url.includes(compareURL))
			if (url.includes(compareURL)) {
				let currentLast = currentURL.split("/").pop()
				let currentIsIndex = currentLast.includes("index") && currentURL.substring(0, currentURL.length - currentLast.length) == url
				let newLast = currentURL.split("/").pop()
				let newIsIndex = newLast.includes("index") && url.substring(0, url.length - newLast.length) == currentURL
				if (this.visitedURLs.includes(url) || currentIsIndex || newIsIndex) continue

				// console.log("going to url: " + url)
				// console.log("with ending: "+url.substring(url.length - 3, url.length))
				if (url.substring(url.length - 3, url.length) == "pdf") {
					await this.getPDFResults(url)
					continue
				}
				await this.getPage(url, depth + 1)
			}
		}
	}

	getDomain(url) {
		var prefix = /^https?:\/\//i;
		var domain = /^[^/:]+/;
		// remove any prefix
		url = url.replace(prefix, "");
		// assume any URL that starts with a / is on the current page's domain
		if (url.charAt(0) === "/") {
			url = window.location.hostname + url;
		}
		// now extract just the domain
		var match = url.match(domain);
		if (match) {
			return (match[0]);
		}
		return (null);
	}

	async getPDFResults(url) {
		let doc = await PDFJS.getDocument({
			url,
			verbosity: 0,
		}).promise
		for (var i = 1; i <= doc.numPages; i++) {
			let page = await doc.getPage(i)
			let content = await page.getTextContent()
			// Search combined text content using regular expression
			var text = content.items
				.map(function (i) {
					return i.str
				})
				.join("")
			var m
			while ((m = this.regex.exec(text))) {
				var line =
					(m[1] ? "..." : "") + m[0] + (m[2] ? "..." : "")
				this.locations.push(ScraperLocation.n(url, line, i))
			}
		}
	}


}

export { Scraper, ScraperLocation }