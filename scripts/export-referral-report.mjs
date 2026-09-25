import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { listReferralCodes, listReferralDailyStats } from "../src/database.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenv.config({ path: path.join(root, ".env.production.local"), quiet: true })
dotenv.config({ path: path.join(root, ".env.local"), override: false, quiet: true })
dotenv.config({ path: path.join(root, ".env"), override: false, quiet: true })

const summary = await listReferralCodes()
const daily = await listReferralDailyStats()
const reportDirectory = path.join(root, "reports")
await mkdir(reportDirectory, { recursive: true })
const outputPath = path.join(reportDirectory, "referral-starts.xlsx")
const workbookData = JSON.stringify({ summary, daily, outputPath })
const pythonCode = String.raw`
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

data = json.load(sys.stdin)
wb = Workbook()
ws = wb.active
ws.title = "خلاصه کدها"
ws.sheet_view.rightToLeft = True
ws.append(["کد ارجاع", "تعداد شروع یکتا", "زمان ساخت", "اولین شروع", "آخرین شروع"])
for row in data["summary"]:
    ws.append([row["code"], row["starts"], str(row["created_at"] or ""), str(row["first_start"] or ""), str(row["last_start"] or "")])
daily = wb.create_sheet("شمارش روزانه")
daily.sheet_view.rightToLeft = True
daily.append(["تاریخ (منطقه زمانی تهران)", "کد ارجاع", "تعداد شروع یکتا"])
for row in data["daily"]:
    daily.append([row["start_date"], row["code"], row["starts"]])
for sheet in wb.worksheets:
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(name="Tahoma", bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="17365D")
        cell.alignment = Alignment(horizontal="center")
    for column in sheet.columns:
        letter = get_column_letter(column[0].column)
        width = max(12, min(36, max(len(str(cell.value or "")) for cell in column) + 3))
        sheet.column_dimensions[letter].width = width
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Tahoma", size=10)
            cell.alignment = Alignment(horizontal="right")
wb.save(data["outputPath"])
`
const bundledPython = "C:/Users/Ali/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
const python = process.env.PYTHON || (existsSync(bundledPython) ? bundledPython : "python")
execFileSync(python, ["-c", pythonCode], { input: workbookData, stdio: ["pipe", "inherit", "inherit"] })
console.log(outputPath)
