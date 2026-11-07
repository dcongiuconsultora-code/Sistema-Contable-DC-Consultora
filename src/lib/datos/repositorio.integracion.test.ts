// Prueba contra la base real de Supabase. Solo corre si se indican las claves:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... npx vitest run repositorio.integracion
// Crea usuarios y una empresa de prueba y al final borra todo.
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leerCsv } from "@/lib/arca/leer-archivo";
import { importarMisComprobantes } from "@/lib/arca/parse";
import { importarSircreb } from "@/lib/arca/retenciones";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";
import { Repositorio } from "./repositorio";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICIO = process.env.SUPABASE_SERVICE_KEY ?? "";
const sufijo = Date.now();
const EMAIL_ESTUDIO = `estudio-prueba-${sufijo}@prueba.local`;
const EMAIL_CLIENTE = `cliente-prueba-${sufijo}@prueba.local`;
const CLAVE = `Prueba-${sufijo}-x`;

describe.skipIf(!URL || !ANON || !SERVICIO)(
  "Repositorio contra Supabase",
  () => {
    let admin: SupabaseClient;
    let estudio: Repositorio;
    let cliente: Repositorio;
    let empresaId = "";
    const usuarios: string[] = [];

    async function entrar(email: string) {
      const db = createClient(URL, ANON, { auth: { persistSession: false } });
      const { error } = await db.auth.signInWithPassword({
        email,
        password: CLAVE,
      });
      if (error) throw error;
      return new Repositorio(db);
    }

    beforeAll(async () => {
      admin = createClient(URL, SERVICIO, { auth: { persistSession: false } });
      await admin.from("emails_estudio").insert({ email: EMAIL_ESTUDIO });
      const e = await admin.auth.admin.createUser({
        email: EMAIL_ESTUDIO,
        password: CLAVE,
        email_confirm: true,
      });
      usuarios.push(e.data.user!.id);
      estudio = await entrar(EMAIL_ESTUDIO);
    });

    afterAll(async () => {
      if (empresaId) {
        const { data } = await admin.storage.from("tickets").list(empresaId);
        if (data?.length)
          await admin.storage
            .from("tickets")
            .remove(data.map((f) => `${empresaId}/${f.name}`));
        await admin.from("empresas").delete().eq("id", empresaId);
      }
      for (const id of usuarios) await admin.auth.admin.deleteUser(id);
      await admin.from("emails_estudio").delete().eq("email", EMAIL_ESTUDIO);
    });

    it("el mail del estudio entra con rol estudio", async () => {
      const { data } = await admin
        .from("perfiles")
        .select("rol")
        .eq("usuario_id", usuarios[0])
        .single();
      expect(data?.rol).toBe("estudio");
    });

    it("el estudio crea una empresa e invita al cliente antes de que tenga usuario", async () => {
      const e = await estudio.crearEmpresa({
        razon_social: "Empresa de Prueba SA",
        cuit: "30711111111",
        condicion_iva: "Responsable inscripto",
      });
      empresaId = e.id;
      await estudio.invitar(EMAIL_CLIENTE.toUpperCase(), empresaId);
      expect(await estudio.invitaciones(empresaId)).toEqual([EMAIL_CLIENTE]);

      const c = await admin.auth.admin.createUser({
        email: EMAIL_CLIENTE,
        password: CLAVE,
        email_confirm: true,
      });
      usuarios.push(c.data.user!.id);
      cliente = await entrar(EMAIL_CLIENTE);
      expect((await cliente.perfil(c.data.user!.id))?.rol).toBe("cliente");
      expect((await cliente.empresas()).map((x) => x.razon_social)).toEqual([
        "Empresa de Prueba SA",
      ]);
    });

    it("el estudio importa comprobantes dos veces sin duplicar, retenciones, banco y saldos", async () => {
      const csv = fs.readFileSync(
        path.join(__dirname, "../../../public/ejemplos/emitidos-ejemplo.csv"),
        "latin1",
      );
      const r = importarMisComprobantes(leerCsv(csv));
      await estudio.guardarComprobantes(
        empresaId,
        "ventas",
        r.comprobantes,
        "emitidos.csv",
      );
      await estudio.guardarComprobantes(
        empresaId,
        "ventas",
        r.comprobantes,
        "emitidos.csv",
      );

      const sircreb = importarSircreb(
        "91730-50001008-42026/092850120440094980184298CAP00003025,00\n",
      );
      const archivoId = await estudio.guardarDeducciones(
        empresaId,
        "sircreb.txt",
        "SIRCREB",
        sircreb.deducciones,
      );

      const resumen: ResumenBancario = {
        banco: "Banco Macro",
        titular: "EMPRESA DE PRUEBA SA",
        cuit: "30711111111",
        desde: "2026-09-01",
        hasta: "2026-09-30",
        controles: [],
        cuentas: [
          {
            banco: "Banco Macro",
            tipo: "CUENTA CORRIENTE",
            numero: "3-1",
            moneda: "ARS",
            saldoInicial: 100,
            saldoFinal: 90,
            impuestoDebitosCreditos: 0,
            movimientos: [
              {
                fecha: "2026-09-02",
                descripcion: "ELECTRICIDAD DEMO",
                referencia: "600002",
                importe: -10,
                saldo: 90,
                pagina: 1,
              },
            ],
          },
        ],
      };
      await estudio.guardarResumen(empresaId, resumen, "resumen.pdf");
      await estudio.guardarSaldos(empresaId, {
        fecha: "2026-08-31",
        saldos: { "1.1.01.006": 100, "3.1.01.001": 100 },
      });

      const datos = await cliente.cargar(empresaId);
      expect(datos.ventas).toHaveLength(r.comprobantes.length);
      expect(datos.ventas.map((c) => c.total).sort()).toEqual(
        r.comprobantes.map((c) => c.total).sort(),
      );
      expect(datos.archivosDeducciones).toEqual([
        {
          id: archivoId,
          nombre: "sircreb.txt",
          origen: "SIRCREB",
          deducciones: sircreb.deducciones,
        },
      ]);
      expect(datos.resumen).toEqual(resumen);
      expect(datos.saldos).toEqual({
        fecha: "2026-08-31",
        saldos: { "1.1.01.006": 100, "3.1.01.001": 100 },
      });

      await estudio.borrarArchivo(archivoId);
      expect((await estudio.cargar(empresaId)).archivosDeducciones).toEqual([]);
    });

    it("el cliente carga y corrige movimientos e importa ARCA, pero no aprueba movimientos", async () => {
      const m: Movimiento = {
        id: crypto.randomUUID(),
        tipo: "gasto",
        fecha: "2026-10-01",
        importe: 1500,
        medio: "efectivo",
        contraparte: "",
        cuitContraparte: "",
        cuenta: "5.3.01.018",
        conFactura: false,
        nota: "Taxi",
        estado: "enviado",
      };
      await cliente.guardarMovimientos(empresaId, [m]);
      await cliente.guardarMovimientos(empresaId, [{ ...m, importe: 1800 }]);
      await expect(
        cliente.guardarMovimientos(empresaId, [{ ...m, estado: "aprobado" }]),
      ).rejects.toThrow(/No se pudo guardar los movimientos/);
      // El cliente también puede importar archivos de ARCA de su empresa.
      await expect(
        cliente.guardarComprobantes(empresaId, "ventas", [], "x.csv"),
      ).resolves.toBeUndefined();

      await estudio.guardarMovimientos(empresaId, [
        { ...m, importe: 1800, estado: "aprobado" },
      ]);
      const vistos = (await cliente.cargar(empresaId)).movimientos;
      expect(vistos).toEqual([
        { ...m, importe: 1800, estado: "aprobado", origen: "cliente" },
      ]);
      await expect(
        cliente.guardarMovimientos(empresaId, [
          { ...m, importe: 1, estado: "enviado" },
        ]),
      ).rejects.toThrow();
    });

    it("el cliente sube un ticket con foto y la puede ver", async () => {
      const png = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (c) => c.charCodeAt(0),
      );
      const id = crypto.randomUUID();
      const datos = {
        legible: true,
        tipoCodigo: 81,
        tipoTexto: "",
        cuitEmisor: "30755555556",
        razonSocialEmisor: "Estación",
        cuitReceptor: "30711111111",
        puntoVenta: 1,
        numero: 2,
        fecha: "2026-10-11",
        netoGravado21: 100,
        netoGravado105: 0,
        netoGravado27: 0,
        iva21: 21,
        iva105: 0,
        iva27: 0,
        noGravado: 0,
        percepcionIva: 0,
        percepcionIibb: 0,
        otrosTributos: 0,
        total: 121,
        cae: "",
        dudas: [],
      };
      await cliente.guardarTicket(
        empresaId,
        { id, datos, porQr: false },
        new Blob([png], { type: "image/png" }),
      );
      const [t] = (await cliente.cargar(empresaId)).tickets;
      expect(t).toMatchObject({ id, datos, porQr: false });
      const foto = await fetch(t.foto);
      expect(foto.status).toBe(200);
      await cliente.borrarTicket(id);
      expect((await cliente.cargar(empresaId)).tickets).toEqual([]);
    });
  },
);
