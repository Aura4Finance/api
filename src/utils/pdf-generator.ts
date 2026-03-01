import fs from "fs"
import path from "path"
import puppeteer from "puppeteer"

export async function generateReceiptPDF(data: any) {
  const templatePath = path.join(__dirname, "../html/receipt.html")
  let html = fs.readFileSync(templatePath, "utf8")

  Object.keys(data).forEach((key) => {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), data[key])
  })

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "networkidle0" })

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  })

  await browser.close()

  return pdfBuffer
}

export function generateReceiptNumber(counter: number): string {
  const year = new Date().getFullYear()
  const padded = counter.toString().padStart(6, "0")

  return `ORF-${year}-${padded}`
}