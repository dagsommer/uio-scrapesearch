import PDFJS from 'pdfjs-dist'
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'

const MAX_DEPTH = 1
class ScraperLocation {
	/* fileURL
	textExcerpt
	constructor(url, exceprt) {
		this.fileURL = url
		this.textExcerpt = exceprt
	} */
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
	}

	start() {
		return new Promise((resolve/*, reject*/) => {
			this.getPage(this.url, 0).then((val)=>{
				console.log(this.locations)
				for (let loc of this.locations) {
					console.log(`${loc.url}: found text: ${loc.text}`)
				}
				resolve()
			})
		})
	}

	async getPage(url, depth) {
		if (depth>MAX_DEPTH) {
			return
		}
		try {
			if (this.visitedURLs.includes(url)) return
			let res = await (await fetch(url)).text()
			this.visitedURLs.push(url)
			await this.parsePage(url, res, depth);
		} catch (e) {
			console.error("Got error in getPage: "+e)
			return
		}
	}

	async parsePage(currentURL, htmlContent, depth) {
		let dom = new JSDOM(htmlContent)
		//.querySelector("a").textContent
		//Check page for contents

		if (!dom.window.document.body.textContent) {
			return
		}
		var regex = new RegExp("\\s?([^\\s]+\\s" + this.phraseToFind + "\\s[^\\s]+)\\s?", "i");
		// console.log(dom.window.document.body.textContent.replace(/\s/g,''))
		// at this point, the line above is the same as: var regex =

		//let matches = "Det som virkelig suger er korona fordi det er det verste som finnes".match(regex)
 		let matches = dom.window.document.body.textContent.match(regex)
		dom.window.document.body.content
		if (!!matches && matches.length > 0) {
			for (let match of matches) {
				console.log("Found match: "+match)
				this.locations.push({ url: currentURL, text: match})
			}
		}

		var allParas = dom.window.document.getElementsByTagName('a')
		for (let param of allParas) {
			//console.log("Found <a> tag!")
			//Only get urls sub page, but not same
			if (!param || !param.getAttribute("href")) {
				continue
			}
			console.log("Found <a> tag with href: "+param.getAttribute("href").split("?")[0].split("#")[0])
			let url = param.getAttribute("href").split("?")[0].split("#")[0] + ""
			//console.log("slashes: "+this.url.match(/\//g).length)
			let compareURL = this.url.match(/\//g).length > 2 ? this.url.substr(0, this.url.lastIndexOf("/")) : this.url
			var t = "\\some\\route\\here";
			//console.log("includes comp url (" + compareURL + "): "+url.includes(compareURL))
			if (url.includes(compareURL)) {
				//console.log("going to url: " + url)
				if (url.substring(url.length-3, url.length-1) == "pdf") {
					console.log("File is PDF!!")
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



	findInPDF(url) {
		var searchText = "JavaScript"
		function searchPage(doc, pageNumber) {
			return doc
				.getPage(pageNumber)
				.then(function (page) {
					return page.getTextContent()
				})
				.then(function (content) {
					// Search combined text content using regular expression
					var text = content.items
						.map(function (i) {
							return i.str
						})
						.join("")
					var re = new RegExp(
						"(.{0,20})" + searchText + "(.{0,20})",
						"gi"
					),
						m
					var lines = []
					while ((m = re.exec(text))) {
						var line =
							(m[1] ? "..." : "") + m[0] + (m[2] ? "..." : "")
						lines.push(line)
					}
					return { page: pageNumber, items: lines }
				})
		}

		var loading = PDFJS.getDocument(url)
		loading.promise
			.then(function (doc) {
				var results = []
				for (var i = 1; i <= doc.numPages; i++)
					results.push(searchPage(doc, i))
				return Promise.all(results)
			})
			.then(function (searchResults) {
				// Display results using divs
				searchResults.forEach(function (result) {
					var div = document.createElement("div")
					div.className = "pr"
					document.body.appendChild(div)
					div.textContent = "Page " + result.page + ":"
					result.items.forEach(function (s) {
						var div2 = document.createElement("div")
						div2.className = "prl"
						div.appendChild(div2)
						div2.textContent = s
					})
				})
			})
			.catch(console.error)
	}
}

export { Scraper, ScraperLocation }