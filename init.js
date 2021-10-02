import {Scraper} from "./Scraper.js"

let scraper = new Scraper(process.argv[2], process.argv[3])
scraper.start()