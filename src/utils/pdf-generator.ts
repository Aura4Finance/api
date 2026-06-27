import fs from "fs"
import path from "path"
import puppeteer from "puppeteer"

export async function generateReceiptPDF(data: any): Promise<Uint8Array> {
  const templatePath = path.join(__dirname, "../../html/receipt.html");
  let html = fs.readFileSync(templatePath, "utf8")

  Object.keys(data).forEach((key) => {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), data[key])
  })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH!,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
})

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "domcontentloaded" })

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      left: '0px',
      top: '0px',
      right: '0px',
      bottom: '0px'
    }
  })

  await browser.close()

  return pdfBuffer
}

export function generateReceiptNumber(counter: number): string {
  const year = new Date().getFullYear()
  const padded = counter.toString().padStart(6, "0")

  return `ORF-${year}-${padded}`
}