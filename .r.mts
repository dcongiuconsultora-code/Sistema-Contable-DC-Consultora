import fs from "node:fs";
import { pdfDesdeExcel } from "./src/lib/informes/excel-a-pdf";
const xls = fs.readFileSync(process.argv[2] + "/rt54.xlsx");
const pdf = await pdfDesdeExcel(xls.buffer.slice(xls.byteOffset, xls.byteOffset + xls.byteLength), { pie: "EMPRESA DE PRUEBA S.A. · Estados contables al 27/11/2026 · Preparado por DC Consultora", excluir: (n) => /ajuste por inflaci/i.test(n), cortarEn: /ACLARACI[OÓ]N SOBRE EL MODELO/i });
fs.writeFileSync(process.argv[2] + "/rt54.pdf", Buffer.from(await pdf.arrayBuffer()));
