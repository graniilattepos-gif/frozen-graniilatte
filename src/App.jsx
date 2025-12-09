// src/App.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient.js";

/* =========================
   GRANILATTE – POS CAFETERÍA (Supabase)
   - Venta sin campos obligatorios (defaults cliente/documento)
   - Domicilio: se pide valor y se suma al total (tipo "Domicilio")
   - Caja: egresos con eliminar + “Cuadre” DIARIO (Efectivo - Egresos del día)
   - Comandas: ver todos (incl. "listo") + Editar (agregar/quitar ítems de pedido pendiente)
   - Estados: pendiente, pagado, anulado, eliminado
   - Secciones en Caja: Pendientes, Pagados, Anuladas, Eliminadas
   - Botones en Caja:
       * Pendientes: Cobrar, Anular, Eliminar (con clave)
       * Pagados: Imprimir, Editar pago, Revertir, Eliminar (con clave)
   - Eliminar: marca estado = "eliminado" (no borra de la BD)
   - Contraseña Caja: 1305
   - Caja: botones Cobrar/Eliminar/Imprimir tamaño “Cobrar” anterior + espaciado + responsive
   - cobrado_at fecha/hora exacta del cobro; totales y cuadre por día.
   - MÓVIL: tablas como “cards” y textos sin “Mesa #null”
   ========================= */

const CLAVE_CAJA = "1305";

/* ===== Catálogo ===== */
const CATALOGO = [
  {
    categoria: "Bebidas Calientes",
    items: [
      { nombre: "Cafe con leche", precio: 1500 },
      { nombre: "Americano", precio: 3000 },
      { nombre: "Capuccino", precio: 5500 },
      { nombre: "Latte Vainilla", precio: 5500 },
      { nombre: "Milo Caliente", precio: 5000 },
      { nombre: "Affogato", precio: 10000 },
      { nombre: "Aromatica", precio: 2500 },
    ],
  },
  {
    categoria: "Bebidas Frías",
    items: [
      { nombre: "Granizados en leche", precio: 5000 },
      { nombre: "Granizados en agua", precio: 4000 },
      { nombre: "Avena Cubana", precio: 3000 },
      { nombre: "Yogurt Natural", precio: 5000 },
      { nombre: "Frapuccino", precio: 8000 },
      { nombre: "Soda Frutos Rojo", precio: 8000 },
      { nombre: "Soda Frutos Amarillos", precio: 8000 },
      { nombre: "Agua en Botella", precio: 2000 },
    ],
  },
  {
    categoria: "Repostería",
    items: [
      { nombre: "Croissant", precio: 3500 },
      { nombre: "Cupcakes", precio: 3500 },
      { nombre: "Alfajores X2", precio: 3000 },
      { nombre: "Porcion de torta", precio: 5000 },
      { nombre: "Galleta Chips", precio: 4000 },
      { nombre: "Wafles de pandebono", precio: 10000 },
      { nombre: "Brownie con helado", precio: 8000 },
      { nombre: "Cono sencillo", precio: 4000 },
      { nombre: "Cono doble", precio: 7000 },
      { nombre: "Cremosito 9oz", precio: 7000 },
      { nombre: "Cremosito 12oz", precio: 11000 },
    ],
  },
  {
    categoria: "Salado",
    items: [
      { nombre: "Pandebono", precio: 1000 },
      { nombre: "Pandebonitos X6", precio: 5000 },
      { nombre: "Arepa con quesillo", precio: 3000 },
      { nombre: "Sandwich de pollo", precio: 12000 },
    ],
  },
  {
    categoria: "Adiciones",
    items: [
      { nombre: "Mermelada de frutos rojos", precio: 2000 },
      { nombre: "Mermelada de mango", precio: 2000 },
      { nombre: "Mermelada de piña", precio: 2000 },
      { nombre: "M$M", precio: 2000 },
      { nombre: "Oreo", precio: 2000 },
      { nombre: "Cahntilly", precio: 2000 },
      { nombre: "Trululu", precio: 2000 },
      { nombre: "Barquillos", precio: 2000 },
      { nombre: "Jumbo mani", precio: 2000 },
      { nombre: "Milo", precio: 2000 },
      { nombre: "Fruta", precio: 2000 },
      { nombre: "Granola", precio: 2000 },
      { nombre: "Zucaritas", precio: 2000 },
      { nombre: "Minichips", precio: 2000 },
    ],
  },
];

/* ===== Sabores de Granizado (orden alfabético) ===== */
const SABORES_GRANIZADO = [
  "Arazá",
  "Café",
  "Fresa",
  "Frutos Rojos",
  "Guanabana",
  "Lulo",
  "Mango",
  "Maracumango",
  "Maracuyá",
  "Milo",
  "Mora",
];

/* ========= UTIL ========= */
const fmt = (n) => "$ " + (Number(n) || 0).toLocaleString("es-CO");
const num7 = (n) => String(n ?? 0).padStart(7, "0");
const nowUTCISO = () => new Date().toISOString();
const dispBogota = (iso) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota" });

const TZ_OFFSET_HOURS = 5; // Colombia UTC-5
function dayRangeUTCForBogota(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, d, TZ_OFFSET_HOURS, 0, 0, 0));
  const nextFrom = new Date(Date.UTC(y, m - 1, d + 1, TZ_OFFSET_HOURS, 0, 0, 0));
  const to = new Date(nextFrom.getTime() - 1);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}
function monthRangeUTCForBogota(ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, TZ_OFFSET_HOURS, 0, 0, 0));
  const nextMonth = m === 12 ? [y + 1, 1] : [y, m + 1];
  const nextFrom = new Date(
    Date.UTC(nextMonth[0], nextMonth[1] - 1, 1, TZ_OFFSET_HOURS, 0, 0, 0)
  );
  const to = new Date(nextFrom.getTime() - 1);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}
function inRange(iso, fromISO, toISO) {
  if (!iso) return false;
  return iso >= fromISO && iso <= toISO;
}

/* ========= Estilos base UI ========= */
function GlobalStyles() {
  return (
    <style>{`
      :root { color-scheme: light; }
      html, body, #root { background:#fff !important; color:#111; min-height:100%; overflow-x:hidden; }
      @media (prefers-color-scheme: dark){ html, body, #root { background:#fff !important; color:#111; } }

      .btnAction { white-space: nowrap; display:inline-block; }
      @media (max-width:480px){ .btnAction{ font-size:12px; } }

      .watermark-daga{ position:fixed; right:10px; bottom:6px; font-size:12px; color:rgba(0,0,0,.45); user-select:none; pointer-events:none; }
      @keyframes flashNew{ 0%{ box-shadow:0 0 0 0 rgba(22,163,74,.75) } 100%{ box-shadow:0 0 0 12px rgba(22,163,74,0) } }
      .card-flash{ animation: flashNew 1s ease-out 2; }

      .modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:1000; }
      .modal-card{ width:min(420px,92vw); background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.12); padding:16px; }
      .modal-title{ font-weight:800; font-size:18px; margin:0 0 8px; }
      .modal-actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
      .modal-input{ width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:8px; font-size:16px; box-sizing:border-box; }
      .modal-error{ color:#dc2626; font-weight:700; font-size:13px; margin-top:6px; }

      /* === Acciones en tablas (Caja) === */
      .actionBtns{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; width:100%; }
      .btnRow{ padding:6px 10px !important; font-size:12px !important; line-height:1.2; flex:0 0 auto; max-width:100%; }
      @media (max-width:420px){ .btnRow{ font-size:11.5px !important; padding:6px 10px !important; } }

      /* ===== Responsive tables -> cards en móvil ===== */
      @media (max-width:480px){
        .tbl thead{ display:none; }
        .tbl, .tbl tbody, .tbl tr, .tbl td{ display:block; width:100%; }
        .tbl tr{
          background:#fff;
          border:1px solid #eee;
          border-radius:12px;
          padding:10px 10px 8px;
          margin-bottom:10px;
          box-shadow:0 2px 8px rgba(0,0,0,.04);
        }
        .tbl td{
          padding:6px 0 !important;
          border-bottom:0 !important;
          display:flex; 
          justify-content:space-between; 
          gap:10px;
          align-items:flex-start;
          font-size:14px;
        }
        .tbl td::before{
          content:attr(data-label);
          font-weight:800;
          color:#444;
          flex:0 0 auto;
        }
        .tbl td.num{ justify-content:space-between; }
        .tbl td.ctr{ justify-content:flex-start; }
        .actionBtns{ justify-content:flex-start; gap:6px; }
        .btnRow{ padding:6px 9px !important; font-size:12px !important; }
      }
      @media (max-width:480px){
        h3{ font-size:18px; margin:10px 0; }
        .totalsDesktop > div{ font-size:12px; }
      }
    `}</style>
  );
}
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  marginBottom: 8,
  borderRadius: 6,
  border: "1px solid #ddd",
  boxSizing: "border-box",
};
const primaryBtn = {
  background: "#1f6feb",
  color: "#fff",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 16,
};
const secondaryBtn = {
  background: "#f3f4f6",
  color: "#111",
  border: "1px solid #e5e7eb",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 16,
};
const btnAdd = { ...primaryBtn, background: "#16a34a", padding: "6px 10px", fontSize: 14 };
const btnRemove = { ...primaryBtn, background: "#dc2626", padding: "6px 10px", fontSize: 12 };

/* ========= Ticket ========= */
function safeTipoLinea(p) {
  return p.tipo === "Mesa"
    ? `Mesa${p.mesa ? " #" + p.mesa : ""}`
    : p.tipo === "Domicilio"
    ? "Domicilio"
    : "Para llevar";
}
function ticketHTML(p) {
  const logo = `${window.location.origin}/logo.png`;
  const filas = (p.items || [])
    .map(
      (it) => `
    <tr><td>${it.nombre}</td><td class="num">${it.cantidad}</td><td class="num">${fmt(
        (it.precio || 0) * (it.cantidad || 0)
      )}</td></tr>
  `
    )
    .join("");
  const pagos = p.pagos || { efectivo: 0, transferencia: 0, tarjeta: 0 };
  const pagoStr = [
    pagos.efectivo ? `Efectivo: ${fmt(pagos.efectivo)}` : null,
    pagos.transferencia ? `Transf.: ${fmt(pagos.transferencia)}` : null,
    pagos.tarjeta ? `Tarjeta: ${fmt(pagos.tarjeta)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Ticket ${num7(
    p.consecutivo
  )}</title>
<style>@page{size:80mm auto;margin:8px}*{font-family:ui-monospace,Consolas,"Courier New",monospace}
body{width:76mm;margin:0 auto;background:#fff}.center{text-align:center}.muted{color:#444;font-size:12px}
h1{font-size:16px;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:4px 0;vertical-align:top}th{text-align:left;border-bottom:1px dashed #aaa}.num{text-align:right}
.tot{font-weight:700;font-size:14px}hr{border:none;border-top:1px dashed #aaa;margin:8px 0}</style></head>
<body>
<div class="center">
  <img src="${logo}" style="max-width:60mm;height:auto"/><h1>Ticket de venta</h1>
  <div class="muted">Cra 11 Sur # 2 - 88 B/Nariño</div>
  <div class="muted">Domicilios: 3137972266</div>
  <div class="muted">N° ${num7(p.consecutivo)} — ${safeTipoLinea(p)}</div>
  <div class="muted">${p.fechaTxt}</div>
</div><hr/>
<div><b>Cliente:</b> ${p.cliente || "Clientes varios"}<br/><b>Documento:</b> ${
    p.documento || "222222222"
  }
${p.tipo === "Domicilio" ? `<br/><b>Tel.:</b> ${p.telefono || "-"}<br/><b>Dirección:</b> ${p.direccion || "-"}` : ""}</div><hr/>
<table><thead><tr><th>Descripción</th><th class="num">Cant</th><th class="num">Valor</th></tr></thead><tbody>${filas}</tbody></table><hr/>
<table>
  <tr><td>Subtotal</td><td></td><td class="num">${fmt(p.subtotal || 0)}</td></tr>
  <tr><td>Descuento</td><td></td><td class="num">${fmt(p.descuento || 0)}</td></tr>
  <tr class="tot"><td>Total</td><td></td><td class="num">${fmt(p.total || 0)}</td></tr>
</table><hr/>
<div class="muted">Pago: ${pagoStr || "-"}</div>
<div class="center" style="margin-top:6px">Atención a partir de las 04:00 p.m.</div>
<div class="center" style="margin-top:8px">¡Gracias por su compra!</div>
<script>window.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),250);};</script>
</body></html>`;
}
function imprimirTicket(p) {
  const w = window.open("", "_blank", "width=380,height=620");
  if (!w) return alert("Habilita los pop-ups.");
  w.document.open();
  w.document.write(ticketHTML(p));
  w.document.close();
}

/* ========= Supabase ========= */
async function sbInsertPedidoConItems(pedido, items) {
  const { data: p, error: e1 } = await supabase
    .from("pedidos")
    .insert([{ ...pedido, fecha: nowUTCISO() }])
    .select("id, consecutivo")
    .single();
  if (e1) {
    console.error(e1);
    throw new Error(`pedidos: ${e1.message}`);
  }
  const filas = items.map((it) => ({
    pedido_id: p.id,
    nombre: it.nombre,
    precio: it.precio,
    cantidad: it.cantidad,
  }));
  const { error: e2 } = await supabase.from("pedido_items").insert(filas);
  if (e2) {
    try {
      await supabase.from("pedidos").delete().eq("id", p.id);
    } catch (_) {}
    throw new Error(`pedido_items: ${e2.message}`);
  }
  return p;
}
async function sbFetchPedidosConItems({ fromISO, toISO }) {
  let q = supabase
    .from("pedidos")
    .select(
      "id, consecutivo, fecha, cobrado_at, tipo, mesa, cliente, documento, telefono, direccion, subtotal, descuento, total, estado, pagos, kitchen_estado"
    )
    .order("fecha", { ascending: false });
  if (fromISO && toISO) q = q.gte("fecha", fromISO).lte("fecha", toISO);
  const { data: pedidos, error: ePedidos } = await q;
  if (ePedidos) throw ePedidos;
  if (!pedidos?.length) return [];
  const { data: items, error: eItems } = await supabase
    .from("pedido_items")
    .select("pedido_id, nombre, precio, cantidad")
    .in(
      "pedido_id",
      pedidos.map((p) => p.id)
    );
  if (eItems) console.warn("items:", eItems.message);
  const map = new Map();
  (items || []).forEach((it) => {
    if (!map.has(it.pedido_id)) map.set(it.pedido_id, []);
    map.get(it.pedido_id).push(it);
  });
  return pedidos.map((row) => ({
    ...row,
    fechaISO: row.fecha,
    fechaTxt: dispBogota(row.fecha),
    items: map.get(row.id) || [],
  }));
}
async function sbMarcarPagado(pedidoId, total, pagos) {
  const { error } = await supabase
    .from("pedidos")
    .update({
      estado: "pagado",
      propina: 0,
      total,
      pagos,
      cobrado_at: nowUTCISO(),
    })
    .eq("id", pedidoId);
  if (error) throw error;
}
async function sbRevertirPago(pedidoId) {
  const { error } = await supabase
    .from("pedidos")
    .update({
      estado: "pendiente",
      pagos: { efectivo: 0, transferencia: 0, tarjeta: 0 },
      cobrado_at: null,
    })
    .eq("id", pedidoId);
  if (error) throw error;
}
async function sbAnularPedido(id) {
  const { error } = await supabase
    .from("pedidos")
    .update({ estado: "anulado" })
    .eq("id", id);
  if (error) throw error;
}
async function sbEliminarPedido(id) {
  // Eliminación lógica: no borra de la BD, solo marca estado = 'eliminado'
  const { error } = await supabase
    .from("pedidos")
    .update({ estado: "eliminado" })
    .eq("id", id);
  if (error) throw error;
}
async function sbMarcarComandaLista(pedidoId) {
  const { error } = await supabase
    .from("pedidos")
    .update({ kitchen_estado: "listo", kitchen_at: nowUTCISO() })
    .eq("id", pedidoId);
  if (error) throw error;
}

/* ======= EGRESOS ======= */
async function sbInsertEgreso({ motivo, monto }) {
  const { data, error } = await supabase
    .from("caja_egresos")
    .insert([{ motivo, monto, fecha: nowUTCISO() }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
async function sbFetchEgresos({ fromISO, toISO }) {
  let q = supabase.from("caja_egresos").select("*").order("fecha", { ascending: true });
  if (fromISO && toISO) q = q.gte("fecha", fromISO).lte("fecha", toISO);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function sbDeleteEgreso(id) {
  const { error } = await supabase.from("caja_egresos").delete().eq("id", id);
  if (error) throw error;
}

/* ======= Reemplazar ítems de un pedido (editar comanda) ======= */
async function sbReemplazarItemsYActualizar(pedido, itemsFinales) {
  if (!pedido?.id) return;
  const pedidoId = pedido.id;

  // Borrar todos los items actuales de este pedido
  const { error: eDel } = await supabase
    .from("pedido_items")
    .delete()
    .eq("pedido_id", pedidoId);
  if (eDel) throw eDel;

  // Insertar los items nuevos
  const filas = itemsFinales.map((it) => ({
    pedido_id: pedidoId,
    nombre: it.nombre,
    precio: it.precio,
    cantidad: it.cantidad,
  }));
  if (filas.length) {
    const { error: eIns } = await supabase.from("pedido_items").insert(filas);
    if (eIns) throw eIns;
  }

  const newSubtotal = itemsFinales.reduce(
    (a, it) => a + (it.precio || 0) * (it.cantidad || 0),
    0
  );
  const newTotal = newSubtotal - (pedido.descuento || 0);

  const { error: eUpd } = await supabase
    .from("pedidos")
    .update({ subtotal: newSubtotal, total: newTotal })
    .eq("id", pedidoId);

  if (eUpd) throw eUpd;
  return { newSubtotal, newTotal };
}

/* ========= Vistas ========= */
function Inicio({ onVender, onCaja, onComandas }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div className="hero">
        <img src="/logo.png" alt="Logo" className="logo" />
        <div className="heroBtns">
          <button onClick={onVender} className="heroBtn" aria-label="Vender">
            <img src="/vender.png" alt="Vender" className="heroBtnImg" />
          </button>
          <button onClick={onCaja} className="heroBtn" aria-label="Caja">
            <img src="/caja.png" alt="Caja" className="heroBtnImg" />
          </button>
          <button onClick={onComandas} className="heroBtn" aria-label="Comandas">
            <img src="/comandas.png" alt="Comandas" className="heroBtnImg" />
          </button>
        </div>
      </div>
      <style>{`
        .hero{ text-align:center } .logo{ width:min(240px,70vw); height:auto; margin:0 auto 20px; display:block }
        .heroBtns{ display:grid; grid-template-columns:1fr; gap:16px; justify-items:center }
        @media (min-width:640px){ .heroBtns{ grid-template-columns:repeat(3, minmax(160px,1fr)) } }
        .heroBtn{ background:transparent; border:none; padding:0; cursor:pointer } .heroBtnImg{ width:min(220px,60vw); height:auto; display:block }
      `}</style>
    </div>
  );
}

function SeleccionTipo({ onElegir, onVolver }) {
  const card = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    cursor: "pointer",
    textAlign: "center",
  };
  const img = {
    width: "min(260px,70vw)",
    height: "auto",
    display: "block",
    margin: "0 auto",
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div style={{ width: "min(720px,96vw)" }}>
        <h2 style={{ marginBottom: 12, textAlign: "center" }}>
          ¿Cómo es la venta?
        </h2>
        <div className="gridTipoVenta">
          <button
            className="btnMesa"
            style={card}
            onClick={() => onElegir("Mesa")}
          >
            <img src="/mesa.png" alt="Para la mesa" style={img} />
          </button>
          <button
            className="btnLlevar"
            style={card}
            onClick={() => onElegir("Llevar")}
          >
            <img src="/llevar.png" alt="Para llevar" style={img} />
          </button>
          <button
            className="btnDomi"
            style={card}
            onClick={() => onElegir("Domicilio")}
          >
            <img src="/domicilio.png" alt="A domicilio" style={img} />
          </button>
          <div className="wrapVolver">
            <button
              style={{
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                padding: "10px 16px",
                borderRadius: 8,
              }}
              onClick={onVolver}
            >
              ⬅ Volver
            </button>
          </div>
        </div>
        <style>{`
          .gridTipoVenta{ display:grid; grid-template-columns:1fr; gap:16px }
          @media (min-width:900px){
            .gridTipoVenta{ display:grid; grid-template-columns:1fr 1fr; gap:16px; grid-template-areas:"mesa mesa" "llevar domi" "volver volver" }
            .btnMesa{ grid-area:mesa } .btnLlevar{ grid-area:llevar } .btnDomi{ grid-area:domi } .wrapVolver{ grid-area:volver; display:flex; justify-content:flex-start }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ========= Venta ========= */
const btnProducto = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 14,
  cursor: "pointer",
  boxSizing: "border-box",
  textAlign: "center",
  minHeight: 110,
};
const nombreProductoStyle = { fontWeight: 800, fontSize: 18, lineHeight: 1.2 };
const precioProductoStyle = {
  fontWeight: 800,
  fontSize: 20,
  color: "#0b7a3e",
  marginTop: 6,
};
function CardProducto({ p, onAdd }) {
  return (
    <button
      style={btnProducto}
      onClick={() => onAdd(p)}
      aria-label={`Agregar ${p.nombre}`}
    >
      <div style={nombreProductoStyle}>{p.nombre}</div>
      <div style={precioProductoStyle}>{fmt(p.precio)}</div>
    </button>
  );
}

function Venta({
  onVolver,
  onPedidoRealizado,
  initialTipo = "Mesa",
  editPedido = null,
  onPedidoEditado,
}) {
  const [categoriaAct, setCategoriaAct] = useState(
    CATALOGO[0]?.categoria || ""
  );
  const [carrito, setCarrito] = useState([]);
  const tipo = editPedido?.tipo || initialTipo;
  const [mesa, setMesa] = useState(""); // opcional
  const [doc, setDoc] = useState("");
  const [cliNombre, setCliNombre] = useState("");
  const [cliTel, setCliTel] = useState("");
  const [cliDir, setCliDir] = useState("");
  const [valorDomicilio, setValorDomicilio] = useState("");

  // Ítems existentes al editar (se pueden modificar / eliminar)
  const [itemsExistentes, setItemsExistentes] = useState(
    editPedido?.items ? editPedido.items.map((it) => ({ ...it })) : []
  );
  useEffect(() => {
    if (editPedido?.items) {
      setItemsExistentes(editPedido.items.map((it) => ({ ...it })));
    } else {
      setItemsExistentes([]);
    }
  }, [editPedido]);

  // Modal granizado
  const [granizadoBase, setGranizadoBase] = useState(null); // {nombre, precio}
  const [saborGranizado, setSaborGranizado] = useState("");

  const productosFiltrados = useMemo(() => {
    const grupos = CATALOGO.filter(
      (g) => !categoriaAct || g.categoria === categoriaAct
    );
    return grupos.flatMap((g) =>
      g.items.map((it) => ({ ...it, _cat: g.categoria }))
    );
  }, [categoriaAct]);

  const subtotalProductos = useMemo(
    () => carrito.reduce((a, it) => a + it.precio * it.cantidad, 0),
    [carrito]
  );
  const domiNum = useMemo(() => {
    if (editPedido || tipo !== "Domicilio") return 0;
    return Number(String(valorDomicilio).replace(/\D/g, "")) || 0;
  }, [valorDomicilio, tipo, editPedido]);

  const subtotal = subtotalProductos + domiNum;
  const total = subtotal;

  // Helper para agregar producto al carrito (sumando cantidad si ya existe)
  const pushProducto = (nombre, precio) =>
    setCarrito((prev) => {
      const idx = prev.findIndex((x) => x.nombre === nombre);
      if (idx >= 0) {
        const next = prev.map((x) => ({ ...x }));
        next[idx].cantidad++;
        return next;
      }
      return [...prev, { nombre, precio, cantidad: 1 }];
    });

  const addProducto = (p) => {
    // Si es granizado, pedimos sabor
    if (p.nombre === "Granizados en leche" || p.nombre === "Granizados en agua") {
      setGranizadoBase(p);
      setSaborGranizado("");
      return;
    }
    // Normal para resto de productos
    pushProducto(p.nombre, p.precio);
  };

  const decProducto = (i) =>
    setCarrito((prev) => {
      const next = prev.map((x) => ({ ...x }));
      next[i].cantidad--;
      return next.filter((x) => x.cantidad > 0);
    });
  const incProducto = (i) =>
    setCarrito((prev) => {
      const next = prev.map((x) => ({ ...x }));
      next[i].cantidad++;
      return next;
    });
  const removeProducto = (i) =>
    setCarrito((prev) => prev.filter((_, idx) => idx !== i));
  const limpiarCarrito = () => setCarrito([]);

  // Edición de ítems existentes del pedido
  const decExistente = (i) =>
    setItemsExistentes((prev) => {
      const next = prev.map((x) => ({ ...x }));
      next[i].cantidad--;
      return next.filter((x) => x.cantidad > 0);
    });
  const incExistente = (i) =>
    setItemsExistentes((prev) => {
      const next = prev.map((x) => ({ ...x }));
      next[i].cantidad++;
      return next;
    });
  const removeExistente = (i) =>
    setItemsExistentes((prev) => prev.filter((_, idx) => idx !== i));

  // Guardar pedido NUEVO
  const realizarPedido = async () => {
    try {
      if (carrito.length === 0) return alert("Agrega al menos un producto.");
      const documento = (doc || "").replace(/\D/g, "") || "222222222";
      const nombre = (cliNombre || "").trim() || "Clientes varios";
      const domi = tipo === "Domicilio" ? domiNum : 0;
      const subtotalLocal = subtotalProductos + domi;
      const totalLocal = subtotalLocal; // sin propina/desc

      const pedidoDB = {
        tipo,
        mesa: tipo === "Mesa" ? mesa.trim() || null : null,
        cliente: nombre,
        documento,
        telefono: tipo === "Domicilio" ? cliTel.trim() || null : null,
        direccion: tipo === "Domicilio" ? cliDir.trim() || null : null,
        subtotal: subtotalLocal,
        descuento: 0,
        total: totalLocal,
        estado: "pendiente",
        pagos: { efectivo: 0, transferencia: 0, tarjeta: 0 },
      };
      await sbInsertPedidoConItems(pedidoDB, carrito);
      limpiarCarrito();
      setMesa("");
      setDoc("");
      setCliNombre("");
      setCliTel("");
      setCliDir("");
      setValorDomicilio("");
      onPedidoRealizado && onPedidoRealizado();
    } catch (err) {
      console.error(err);
      alert(`No se pudo registrar el pedido.\n\n${err?.message || err}`);
    }
  };

  // Guardar cambios de pedido EXISTENTE (modo edición desde Comandas)
  const guardarCambiosPedidoExistente = async () => {
    try {
      if (!editPedido?.id) return alert("Pedido inválido.");
      const itemsFinales = [...itemsExistentes, ...carrito];
      if (!itemsFinales.length)
        return alert("El pedido debe tener al menos un producto.");

      await sbReemplazarItemsYActualizar(editPedido, itemsFinales);
      limpiarCarrito();
      onPedidoEditado && onPedidoEditado();
    } catch (err) {
      console.error(err);
      alert(`No se pudo actualizar el pedido.\n\n${err?.message || err}`);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <img src="/logo.png" alt="Logo" style={{ width: 150 }} />
        <button style={secondaryBtn} onClick={onVolver}>
          ⬅ Volver
        </button>
      </header>

      {editPedido ? (
        <div
          style={{
            margin: "-8px 0 12px",
            padding: "8px 12px",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
          }}
        >
          <b>Editando pedido:</b> #{num7(editPedido.consecutivo)} —{" "}
          {editPedido.tipo}
        </div>
      ) : null}

      <div className="ventaGrid">
        <aside style={{ width: "100%" }}>
          {/* Datos de cliente: opcionales; en edición se ocultan */}
          {!editPedido && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  value={doc}
                  onChange={(e) =>
                    setDoc(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Documento"
                  inputMode="numeric"
                  style={inputStyle}
                />
                <input
                  value={cliNombre}
                  onChange={(e) => setCliNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  style={inputStyle}
                />
              </div>
              {tipo === "Mesa" && (
                <input
                  value={mesa}
                  onChange={(e) => setMesa(e.target.value)}
                  placeholder="Número de mesa"
                  style={inputStyle}
                />
              )}
              {tipo === "Domicilio" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      value={cliTel}
                      onChange={(e) =>
                        setCliTel(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="Celular"
                      inputMode="numeric"
                      style={inputStyle}
                    />
                    <input
                      value={cliDir}
                      onChange={(e) => setCliDir(e.target.value)}
                      placeholder="Dirección"
                      style={{ ...inputStyle, gridColumn: "1 / span 1" }}
                    />
                  </div>
                  <input
                    value={valorDomicilio}
                    onChange={(e) =>
                      setValorDomicilio(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Valor domicilio"
                    inputMode="numeric"
                    style={inputStyle}
                  />
                </>
              )}
            </>
          )}

          {/* Pedido actual en modo edición (ítems existentes) */}
          {editPedido && itemsExistentes.length > 0 && (
            <section
              style={{
                width: "100%",
                background: "#fff",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <h3>Pedido actual #{num7(editPedido.consecutivo)}</h3>
              <div
                className="tableWrap"
                style={{ maxHeight: "40vh", overflowY: "auto" }}
              >
                <table className="tbl">
                  <tbody>
                    {itemsExistentes.map((it, idx) => (
                      <tr key={idx}>
                        <td data-label="Producto">
                          <div style={{ fontWeight: 700 }}>{it.nombre}</div>
                          <div style={{ fontSize: 12, color: "#555" }}>
                            {fmt(it.precio)} c/u
                          </div>
                        </td>
                        <td data-label="Cant." className="ctr">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              justifyContent: "center",
                            }}
                          >
                            <button
                              style={btnRemove}
                              onClick={() => decExistente(idx)}
                            >
                              -
                            </button>
                            <div
                              style={{
                                minWidth: 20,
                                textAlign: "center",
                                fontWeight: 700,
                              }}
                            >
                              {it.cantidad}
                            </div>
                            <button
                              style={btnAdd}
                              onClick={() => incExistente(idx)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td data-label="Subtotal" className="num">
                          {fmt((it.precio || 0) * (it.cantidad || 0))}
                        </td>
                        <td data-label="Quitar" className="ctr">
                          <button
                            style={btnRemove}
                            onClick={() => removeExistente(idx)}
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Subtotal actual</span>
                <b>{fmt(editPedido.subtotal || 0)}</b>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Descuento</span>
                <b>{fmt(editPedido.descuento || 0)}</b>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Total actual</span>
                <b>
                  {fmt(
                    (editPedido.subtotal || 0) - (editPedido.descuento || 0)
                  )}
                </b>
              </div>
            </section>
          )}

          {/* Categorías */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CATALOGO.map((g) => (
              <button
                key={g.categoria}
                style={{
                  ...secondaryBtn,
                  background:
                    categoriaAct === g.categoria ? "#1f6feb" : "#f3f4f6",
                  color:
                    categoriaAct === g.categoria ? "#fff" : "#111",
                  padding: "6px 10px",
                  fontSize: 14,
                }}
                onClick={() => setCategoriaAct(g.categoria)}
              >
                {g.categoria}
              </button>
            ))}
          </div>

          {/* Productos */}
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {productosFiltrados.map((p) => (
              <CardProducto key={p.nombre} p={p} onAdd={addProducto} />
            ))}
          </div>
        </aside>

        {/* Carrito */}
        <section
          style={{
            width: "100%",
            background: "#fff",
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
            height: "fit-content",
          }}
        >
          <h3>
            {editPedido ? "Agregar al pedido" : "Carrito"} ({carrito.length})
          </h3>
          {carrito.length === 0 ? (
            <div style={{ color: "#666" }}>No hay productos aún.</div>
          ) : (
            carrito.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid #eee",
                  padding: "6px 0",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{item.nombre}</div>
                  <div className="muted">{fmt(item.precio)}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <button style={btnRemove} onClick={() => decProducto(i)}>
                    -
                  </button>
                  <div
                    style={{
                      minWidth: 20,
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    {item.cantidad}
                  </div>
                  <button style={btnAdd} onClick={() => incProducto(i)}>
                    +
                  </button>
                </div>
                <div style={{ width: 110, textAlign: "right" }}>
                  {fmt(item.precio * item.cantidad)}
                </div>
                <button style={btnRemove} onClick={() => removeProducto(i)}>
                  X
                </button>
              </div>
            ))
          )}

          <div
            style={{
              marginTop: 10,
              borderTop: "1px solid #eee",
              paddingTop: 8,
            }}
          >
            {/* Resumen de totales */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Productos</span>
              <b>{fmt(subtotalProductos)}</b>
            </div>
            {!editPedido && tipo === "Domicilio" && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Domicilio</span>
                <b>{fmt(domiNum)}</b>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontSize: 18,
              }}
            >
              <span>
                <b>Total</b>
              </span>
              <span>
                <b>{fmt(total)}</b>
              </span>
            </div>

            {/* Previsualización del nuevo total al agregar (solo en edición) */}
            {editPedido && carrito.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px dashed #eee",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Subtotal nuevo</span>
                  <b>
                    {fmt(
                      subtotalProductos +
                        itemsExistentes.reduce(
                          (a, it) =>
                            a +
                            (it.precio || 0) * (it.cantidad || 0),
                          0
                        )
                    )}
                  </b>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Total nuevo</span>
                  <b>
                    {fmt(
                      subtotalProductos +
                        itemsExistentes.reduce(
                          (a, it) =>
                            a +
                            (it.precio || 0) * (it.cantidad || 0),
                          0
                        ) -
                        (editPedido.descuento || 0)
                    )}
                  </b>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {editPedido ? (
                <button
                  style={{ ...primaryBtn, flex: 1 }}
                  onClick={guardarCambiosPedidoExistente}
                >
                  Guardar cambios
                </button>
              ) : (
                <button
                  style={{ ...primaryBtn, flex: 1 }}
                  onClick={realizarPedido}
                >
                  Realizar pedido
                </button>
              )}
              <button style={{ ...secondaryBtn }} onClick={limpiarCarrito}>
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <style>{`
          .ventaGrid{ display:grid; grid-template-columns:1fr; gap:12px }
          @media (min-width:900px){ .ventaGrid{ grid-template-columns:1fr 420px } }
        `}</style>
      </div>

      {/* Modal selección de sabor para granizados */}
      {granizadoBase && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 className="modal-title">Elegir sabor de granizado</h3>
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              Producto: <b>{granizadoBase.nombre}</b>
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {SABORES_GRANIZADO.map((sabor) => (
                <button
                  key={sabor}
                  type="button"
                  onClick={() => setSaborGranizado(sabor)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border:
                      saborGranizado === sabor
                        ? "2px solid #1f6feb"
                        : "1px solid #e5e7eb",
                    background:
                      saborGranizado === sabor ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  {sabor}
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setGranizadoBase(null);
                  setSaborGranizado("");
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  if (!saborGranizado) {
                    alert("Selecciona un sabor para el granizado.");
                    return;
                  }
                  const nombreCompuesto = `${granizadoBase.nombre} - ${saborGranizado}`;
                  pushProducto(nombreCompuesto, granizadoBase.precio);
                  setGranizadoBase(null);
                  setSaborGranizado("");
                }}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= COMANDAS ========= */
function Comandas({ onVolver, onEditarPedido }) {
  const [dia, setDia] = useState(ymdLocalFromDate());
  const [tipoFiltro, setTipoFiltro] = useState("Todos"); // Todos | Mesa | Llevar | Domicilio
  const [comandas, setComandas] = useState([]);
  const newFlashRef = useRef(new Set());

  const cargar = async () => {
    const { fromISO, toISO } = dayRangeUTCForBogota(dia);
    const { fromISO: mesFrom, toISO: mesTo } = monthRangeUTCForBogota(
      dia.slice(0, 7)
    );
    const data = await sbFetchPedidosConItems({
      fromISO: mesFrom,
      toISO: mesTo,
    });
    let arr = data.filter((p) => inRange(p.fechaISO, fromISO, toISO));
    // No mostrar anulados ni eliminados en Comandas
    arr = arr.filter(
      (p) => p.estado !== "anulado" && p.estado !== "eliminado"
    );
    if (tipoFiltro !== "Todos") arr = arr.filter((p) => p.tipo === tipoFiltro);
    arr.sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
    setComandas(arr);
  };
  useEffect(() => {
    cargar();
  }, [dia, tipoFiltro]);

  useEffect(() => {
    const debRef = { t: null };
    const debounce = (fn) => {
      if (debRef.t) clearTimeout(debRef.t);
      debRef.t = setTimeout(fn, 120);
    };
    const ch = supabase
      .channel("rt-comandas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new;
            const { fromISO, toISO } = dayRangeUTCForBogota(dia);
            if (row.fecha >= fromISO && row.fecha <= toISO)
              newFlashRef.current.add(row.id);
          }
          debounce(cargar);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => debounce(cargar)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (debRef.t) clearTimeout(debRef.t);
    };
  }, [dia, tipoFiltro]);

  const small = { fontSize: 13, lineHeight: 1.25 };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16, ...small }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <img src="/logo.png" alt="Logo" style={{ width: 130 }} />
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12 }}>Día:</label>
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            style={{ ...inputStyle, width: 180, marginBottom: 0, ...small }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Todos", "Mesa", "Llevar", "Domicilio"].map((op) => (
              <button
                key={op}
                onClick={() => setTipoFiltro(op)}
                style={{
                  ...secondaryBtn,
                  padding: "6px 10px",
                  fontSize: 12,
                  background: tipoFiltro === op ? "#1f6feb" : "#f3f4f6",
                  color: tipoFiltro === op ? "#fff" : "#111",
                }}
              >
                {op}
              </button>
            ))}
          </div>
          <button
            style={{ ...secondaryBtn, fontSize: 12, padding: "8px 12px" }}
            onClick={onVolver}
          >
            ⬅ Volver
          </button>
        </div>
      </header>

      {comandas.length === 0 ? (
        <p style={{ color: "#666" }}>No hay pedidos para el día seleccionado.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
          }}
        >
          {comandas.map((c) => (
            <div
              key={c.id}
              className={newFlashRef.current.has(c.id) ? "card-flash" : ""}
              onAnimationEnd={() => newFlashRef.current.delete(c.id)}
              style={{
                border:
                  "1px solid " +
                  (c.kitchen_estado === "listo" ? "#16a34a" : "#e5e7eb"),
                background: c.kitchen_estado === "listo" ? "#ecfdf5" : "#fff",
                borderRadius: 10,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  #{num7(c.consecutivo)}
                  {c.kitchen_estado === "listo" && (
                    <span
                      style={{
                        marginLeft: 6,
                        background: "#16a34a",
                        color: "#fff",
                        borderRadius: 999,
                        padding: "1px 6px",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      Listo
                    </span>
                  )}
                </div>
                <div style={{ color: "#555", fontSize: 12 }}>
                  {c.fechaTxt}
                </div>
              </div>

              <div style={{ marginBottom: 4, fontWeight: 700 }}>
                {c.tipo === "Mesa"
                  ? `Mesa${c.mesa ? " #" + c.mesa : ""}`
                  : c.tipo === "Domicilio"
                  ? `Domicilio — ${c.cliente || "-"}`
                  : `Para llevar — ${c.cliente || "Clientes varios"}`}
              </div>

              {c.tipo === "Domicilio" && (
                <div
                  style={{
                    color: "#444",
                    marginBottom: 4,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <b>Tel:</b> {c.telefono || "-"}
                  </div>
                  <div>
                    <b>Dir:</b> {c.direccion || "-"}
                  </div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px dashed #ddd",
                  paddingTop: 4,
                  maxHeight: 200,
                  overflow: "auto",
                }}
              >
                {(c.items || []).map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{it.nombre}</div>
                    <div style={{ fontWeight: 800 }}>{it.cantidad}x</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 6,
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                {c.kitchen_estado !== "listo" && (
                  <button
                    onClick={async () => {
                      try {
                        await sbMarcarComandaLista(c.id);
                      } catch (e) {
                        alert("No se pudo marcar como Listo.");
                      }
                    }}
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Listo
                  </button>
                )}
                <button
                  onClick={() => onEditarPedido && onEditarPedido(c)}
                  style={{
                    background: "#1f6feb",
                    color: "#fff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========= Caja ========= */
function Caja({ onVolver }) {
  const [pedidos, setPedidos] = useState([]);
  const [sel, setSel] = useState(null); // pedido seleccionado para COBRO normal
  const [editPagoPedido, setEditPagoPedido] = useState(null); // pedido para modal Editar Pago
  const [dia, setDia] = useState(ymdLocalFromDate());
  const [mes, setMes] = useState(ymLocalFromDate());

  const [egresos, setEgresos] = useState([]);

  const recargar = async () => {
    try {
      const { fromISO, toISO } = monthRangeUTCForBogota(mes);
      const data = await sbFetchPedidosConItems({ fromISO, toISO });
      setPedidos(data);
      try {
        setEgresos(await sbFetchEgresos({ fromISO, toISO }));
      } catch {
        setEgresos([]);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudieron cargar los datos.");
    }
  };
  useEffect(() => {
    recargar();
  }, [mes]);

  useEffect(() => {
    const debRef = { t: null };
    const debounce = (fn) => {
      if (debRef.t) clearTimeout(debRef.t);
      debRef.t = setTimeout(fn, 150);
    };
    const ch = supabase
      .channel("rt-caja")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => debounce(recargar)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => debounce(recargar)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (debRef.t) clearTimeout(debRef.t);
    };
  }, [mes]);

  // Cobro normal (pendientes)
  const [efectivo, setEfectivo] = useState("");
  const [transferencia, setTransferencia] = useState("");
  const [tarjeta, setTarjeta] = useState("");

  const abrirCobro = (p) => {
    setSel(structuredClone(p));
    // Para cobro de pendientes, arrancamos en cero:
    setEfectivo("");
    setTransferencia("");
    setTarjeta("");
  };

  const abrirEditarPago = (p) => {
    setEditPagoPedido(structuredClone(p));
    const pagos = p.pagos || {};
    setEfectivo(pagos.efectivo ? String(pagos.efectivo) : "");
    setTransferencia(pagos.transferencia ? String(pagos.transferencia) : "");
    setTarjeta(pagos.tarjeta ? String(pagos.tarjeta) : "");
  };

  const reimprimir = (p) => imprimirTicket(p);

  const pedirClaveEliminar = () => {
    const clave = prompt("Digite la contraseña de Caja para eliminar:");
    if ((clave || "").trim() !== CLAVE_CAJA) {
      alert("Contraseña incorrecta.");
      return false;
    }
    return true;
  };

  const eliminar = async (id) => {
    if (!confirm("¿Marcar este pedido como ELIMINADO?")) return;
    if (!pedirClaveEliminar()) return;
    await sbEliminarPedido(id);
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estado: "eliminado" } : p))
    );
    if (sel?.id === id) setSel(null);
    if (editPagoPedido?.id === id) setEditPagoPedido(null);
  };

  const anular = async (id) => {
    if (!confirm("¿Anular este pedido?")) return;
    await sbAnularPedido(id);
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estado: "anulado" } : p))
    );
    if (sel?.id === id) setSel(null);
  };

  const cobrar = async () => {
    if (!sel) return;
    const total = (sel.subtotal || 0) - (sel.descuento || 0);
    const e = Number(String(efectivo).replace(/\D/g, "")) || 0;
    const t = Number(String(transferencia).replace(/\D/g, "")) || 0;
    const tj = Number(String(tarjeta).replace(/\D/g, "")) || 0;
    if (e + t + tj !== total)
      return alert(
        `La suma de pagos (${fmt(
          e + t + tj
        )}) debe ser IGUAL al total (${fmt(total)}).`
      );
    await sbMarcarPagado(sel.id, total, {
      efectivo: e,
      transferencia: t,
      tarjeta: tj,
    });
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === sel.id
          ? {
              ...p,
              estado: "pagado",
              total,
              pagos: { efectivo: e, transferencia: t, tarjeta: tj },
              cobrado_at: nowUTCISO(),
            }
          : p
      )
    );
    setSel(null);
    setEfectivo("");
    setTransferencia("");
    setTarjeta("");
  };

  const guardarEdicionPago = async () => {
    if (!editPagoPedido) return;
    const total = (editPagoPedido.subtotal || 0) - (editPagoPedido.descuento || 0);
    const e = Number(String(efectivo).replace(/\D/g, "")) || 0;
    const t = Number(String(transferencia).replace(/\D/g, "")) || 0;
    const tj = Number(String(tarjeta).replace(/\D/g, "")) || 0;

    if (e + t + tj !== total) {
      alert(
        `La suma de pagos (${fmt(
          e + t + tj
        )}) debe ser IGUAL al total (${fmt(total)}).`
      );
      return;
    }

    try {
      await sbMarcarPagado(editPagoPedido.id, total, {
        efectivo: e,
        transferencia: t,
        tarjeta: tj,
      });

      setPedidos((prev) =>
        prev.map((p) =>
          p.id === editPagoPedido.id
            ? {
                ...p,
                estado: "pagado",
                total,
                pagos: { efectivo: e, transferencia: t, tarjeta: tj },
                cobrado_at: nowUTCISO(),
              }
            : p
        )
      );

      setEditPagoPedido(null);
      setEfectivo("");
      setTransferencia("");
      setTarjeta("");
    } catch (err) {
      console.error(err);
      alert("No se pudo actualizar la forma de pago.");
    }
  };

  const { fromISO: dayFrom, toISO: dayTo } = dayRangeUTCForBogota(dia);

  // Filtrado por estado
  const pedidosDeHoy = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          inRange(p.fechaISO, dayFrom, dayTo) &&
          (p.estado === "pendiente" || p.estado === "pagado")
      ),
    [pedidos, dayFrom, dayTo]
  );

  const pagadosHoy = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          p.estado === "pagado" &&
          ((p.cobrado_at && inRange(p.cobrado_at, dayFrom, dayTo)) ||
            (!p.cobrado_at && inRange(p.fechaISO, dayFrom, dayTo)))
      ),
    [pedidos, dayFrom, dayTo]
  );

  const pendientesHoy = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          p.estado === "pendiente" && inRange(p.fechaISO, dayFrom, dayTo)
      ),
    [pedidos, dayFrom, dayTo]
  );

  const anuladasHoy = useMemo(
    () =>
      pedidos.filter(
        (p) => p.estado === "anulado" && inRange(p.fechaISO, dayFrom, dayTo)
      ),
    [pedidos, dayFrom, dayTo]
  );

  const eliminadasHoy = useMemo(
    () =>
      pedidos.filter(
        (p) => p.estado === "eliminado" && inRange(p.fechaISO, dayFrom, dayTo)
      ),
    [pedidos, dayFrom, dayTo]
  );

  const egresosDelDia = useMemo(
    () => egresos.filter((e) => inRange(e.fecha, dayFrom, dayTo)),
    [egresos, dayFrom, dayTo]
  );
  const totalEgresosDia = useMemo(
    () => egresosDelDia.reduce((a, e) => a + (e.monto || 0), 0),
    [egresosDelDia]
  );

  const agregados = useMemo(() => {
    const e = pagadosHoy.reduce(
      (a, p) => a + (p.pagos?.efectivo || 0),
      0
    );
    const t = pagadosHoy.reduce(
      (a, p) => a + (p.pagos?.transferencia || 0),
      0
    );
    const tj = pagadosHoy.reduce(
      (a, p) => a + (p.pagos?.tarjeta || 0),
      0
    );

    const cobradosTotal = pagadosHoy.reduce(
      (a, p) => a + (p.total || 0),
      0
    );
    const ventasDiaTotal = pedidosDeHoy.reduce(
      (a, p) => a + (p.total || 0),
      0
    );

    return {
      pedidosDia: pedidosDeHoy.length,
      pendientes: pendientesHoy.length,
      pagados: pagadosHoy.length,
      eNum: e,
      tNum: t,
      tjNum: tj,
      ventasDiaTotal,
      cobradosTotal,
      ventasDiaFmt: ventasDiaTotal.toLocaleString("es-CO"),
      cobradosFmt: cobradosTotal.toLocaleString("es-CO"),
      eFmt: e.toLocaleString("es-CO"),
      tFmt: t.toLocaleString("es-CO"),
      tjFmt: tj.toLocaleString("es-CO"),
    };
  }, [pedidosDeHoy, pendientesHoy, pagadosHoy]);

  const pendientesArr = pendientesHoy;
  const pagadosArr = pagadosHoy;

  const efectivoNeto = Math.max(0, (agregados.eNum || 0) - totalEgresosDia);

  // Modal Egreso
  const [askEgreso, setAskEgreso] = useState(false);
  const [egMotivo, setEgMotivo] = useState("");
  const [egMonto, setEgMonto] = useState("");
  async function guardarEgreso() {
    try {
      const monto =
        Number(String(egMonto).replace(/\D/g, "")) || 0;
      if (!egMotivo.trim() || !monto)
        return alert("Completa la referencia y el valor.");
      const reg = await sbInsertEgreso({
        motivo: egMotivo.trim(),
        monto,
      });
      setEgresos((prev) => [...prev, reg]);
      setAskEgreso(false);
      setEgMotivo("");
      setEgMonto("");
      alert("Egreso registrado.");
    } catch (e) {
      console.error(e);
      alert(
        "No se pudo registrar el egreso. Verifica políticas/tabla 'caja_egresos'."
      );
    }
  }
  const eliminarEgreso = async (id) => {
    if (!confirm("¿Eliminar egreso?")) return;
    try {
      await sbDeleteEgreso(id);
      setEgresos((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert("No se pudo eliminar el egreso.");
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <header className="cajaHeader">
        <img src="/logo.png" alt="Logo" style={{ width: 150 }} />
        <div className="cajaActions">
          <button
            style={secondaryBtn}
            className="btnAction"
            onClick={() => {
              const arr = [...pagadosHoy, ...pendientesHoy];
              if (!arr.length)
                return alert("No hay registros para exportar.");
              const filas = [];
              for (const v of arr) {
                for (const it of v.items ?? []) {
                  filas.push({
                    Fecha: v.fechaTxt,
                    CobradoEn: v.cobrado_at
                      ? dispBogota(v.cobrado_at)
                      : "",
                    Numero: num7(v.consecutivo),
                    Estado: v.estado,
                    Tipo:
                      v.tipo === "Mesa"
                        ? `Mesa${v.mesa ? " #" + v.mesa : ""}`
                        : v.tipo === "Domicilio"
                        ? `Domicilio — ${v.cliente}`
                        : "Para llevar",
                    Documento: v.documento || "",
                    Cliente: v.cliente || "",
                    Producto: it.nombre,
                    Cantidad: it.cantidad,
                    PrecioUnit: it.precio,
                    SubtotalItem: it.precio * it.cantidad,
                    Descuento: v.descuento || 0,
                    TotalPedido: v.total || 0,
                    Efectivo: v.pagos?.efectivo || 0,
                    Transferencia: v.pagos?.transferencia || 0,
                    Tarjeta: v.pagos?.tarjeta || 0,
                  });
                }
              }
              const ws = XLSX.utils.json_to_sheet(filas);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
              XLSX.writeFile(wb, `pedidos_${dia}.xlsx`);
            }}
          >
            Exportar día
          </button>
          <button
            style={secondaryBtn}
            className="btnAction"
            onClick={() => {
              const { fromISO: mFrom, toISO: mTo } =
                monthRangeUTCForBogota(mes);
              const delMes = pedidos.filter((p) =>
                inRange(p.fechaISO, mFrom, mTo)
              );
              if (!delMes.length)
                return alert("No hay registros para el mes.");
              const filas = [];
              for (const v of delMes) {
                for (const it of v.items ?? []) {
                  filas.push({
                    Fecha: v.fechaTxt,
                    CobradoEn: v.cobrado_at
                      ? dispBogota(v.cobrado_at)
                      : "",
                    Numero: num7(v.consecutivo),
                    Estado: v.estado,
                    Tipo:
                      v.tipo === "Mesa"
                        ? `Mesa${v.mesa ? " #" + v.mesa : ""}`
                        : v.tipo === "Domicilio"
                        ? `Domicilio — ${v.cliente}`
                        : "Para llevar",
                    Documento: v.documento || "",
                    Cliente: v.cliente || "",
                    Producto: it.nombre,
                    Cantidad: it.cantidad,
                    PrecioUnit: it.precio,
                    SubtotalItem: it.precio * it.cantidad,
                    Descuento: v.descuento || 0,
                    TotalPedido: v.total || 0,
                    Efectivo: v.pagos?.efectivo || 0,
                    Transferencia: v.pagos?.transferencia || 0,
                    Tarjeta: v.pagos?.tarjeta || 0,
                  });
                }
              }
              const ws = XLSX.utils.json_to_sheet(filas);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
              XLSX.writeFile(wb, `pedidos_${mes}.xlsx`);
            }}
          >
            Exportar mes
          </button>

          <button
            style={{
              ...secondaryBtn,
              background: "#fde2e2",
              borderColor: "#fca5a5",
            }}
            className="btnAction"
            onClick={() => setAskEgreso(true)}
          >
            Egreso
          </button>
          <button
            style={secondaryBtn}
            className="btnAction"
            onClick={onVolver}
          >
            ⬅ Volver
          </button>
        </div>
      </header>

      {/* Filtros + Totales + Cuadre (DIARIO) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <div>
            <label style={{ fontSize: 14, marginRight: 6 }}>Día:</label>
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              style={{ ...inputStyle, width: 200, marginBottom: 0 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 14, marginRight: 6 }}>Mes:</label>
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              style={{ ...inputStyle, width: 200, marginBottom: 0 }}
            />
          </div>
          <button
            style={secondaryBtn}
            className="btnAction"
            onClick={recargar}
          >
            Actualizar
          </button>
        </div>
        <div
          className="totalsDesktop"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: "#eef2ff",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Pedidos: {agregados.pedidosDia}
          </div>
          <div
            style={{
              background: "#d1fae5",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Pagados: {agregados.pagados}
          </div>
          <div
            style={{
              background: "#fef3c7",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Pendientes: {agregados.pendientes}
          </div>
          <div
            style={{
              background: "#e5f9e7",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Efec. $ {agregados.eFmt}
          </div>
          <div
            style={{
              background: "#e0f2fe",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Transf. $ {agregados.tFmt}
          </div>
          <div
            style={{
              background: "#fde2e2",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Tarjeta $ {agregados.tjFmt}
          </div>
          <div
            style={{
              background: "#e5e7eb",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Venta del día $ {agregados.ventasDiaFmt}
          </div>
          <div
            style={{
              background: "#e0f2fe",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            Cobrado hoy $ {agregados.cobradosFmt}
          </div>
          <div
            style={{
              background: "#fff7ed",
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 900,
              border: "1px solid #fed7aa",
            }}
          >
            Cuadre: $ {efectivoNeto.toLocaleString("es-CO")}
          </div>
        </div>
      </div>

      {/* Pendientes + Cobro */}
      <div className="cajaGrid">
        <section>
          <h3>Pendientes ({pendientesArr.length})</h3>
          {pendientesArr.length === 0 ? (
            <p style={{ color: "#666" }}>No hay pedidos pendientes.</p>
          ) : (
            <div className="tableWrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>N°</th>
                    <th>Tipo</th>
                    <th className="num">Total</th>
                    <th className="ctr">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesArr.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Fecha">{p.fechaTxt}</td>
                      <td data-label="N°">{num7(p.consecutivo)}</td>
                      <td data-label="Tipo">
                        {p.tipo === "Mesa"
                          ? `Mesa${p.mesa ? " #" + p.mesa : ""} — ${
                              p.cliente || "Clientes varios"
                            }`
                          : p.tipo === "Domicilio"
                          ? `Domicilio — ${p.cliente || "-"}`
                          : `Para llevar — ${
                              p.cliente || "Clientes varios"
                            }`}
                      </td>
                      <td data-label="Total" className="num">
                        {fmt(p.total)}
                      </td>
                      <td data-label="Acciones" className="ctr">
                        <div className="actionBtns">
                          <button
                            className="btnAction btnRow"
                            style={{
                              ...primaryBtn,
                              padding: "6px 10px",
                              fontSize: 12,
                            }}
                            onClick={() => abrirCobro(p)}
                          >
                            Cobrar
                          </button>
                          <button
                            className="btnAction btnRow"
                            style={{
                              ...secondaryBtn,
                              padding: "6px 10px",
                              fontSize: 12,
                              background: "#fef3c7",
                              borderColor: "#facc15",
                              color: "#92400e",
                            }}
                            onClick={() => anular(p.id)}
                          >
                            Anular
                          </button>
                          <button
                            className="btnAction btnRow"
                            style={{
                              ...btnRemove,
                              padding: "6px 10px",
                              fontSize: 12,
                            }}
                            onClick={() => eliminar(p.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3>Cobro</h3>
          {!sel ? (
            <p style={{ color: "#666" }}>Selecciona un pedido para cobrar.</p>
          ) : (
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <b>Pedido:</b> {num7(sel.consecutivo)} • {sel.fechaTxt}
                <br />
                <b>Tipo:</b>{" "}
                {sel.tipo === "Mesa"
                  ? `Mesa${sel.mesa ? " #" + sel.mesa : ""}`
                  : sel.tipo === "Domicilio"
                  ? `Domicilio — ${sel.cliente} (${sel.telefono || "-"})`
                  : `Para llevar — ${sel.cliente || "Clientes varios"}`}
                <br />
                <b>Cliente:</b> {sel.cliente || "Clientes varios"} —{" "}
                <b>Doc:</b> {sel.documento || "222222222"}
                {sel.tipo === "Domicilio" ? (
                  <>
                    <br />
                    <b>Dirección:</b> {sel.direccion || "-"}
                  </>
                ) : null}
              </div>
              <div
                className="tableWrap"
                style={{ maxHeight: "60vh", overflowY: "auto" }}
              >
                <table className="tbl">
                  <tbody>
                    {(sel.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td data-label="Producto">
                          {it.nombre} x {it.cantidad}
                        </td>
                        <td data-label="Subtotal" className="num">
                          {fmt((it.precio || 0) * (it.cantidad || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Subtotal</span>
                <b>{fmt(sel.subtotal || 0)}</b>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Descuento</span>
                <b>{fmt(sel.descuento || 0)}</b>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 18,
                }}
              >
                <span>
                  <b>Total</b>
                </span>
                <b>
                  {fmt((sel.subtotal || 0) - (sel.descuento || 0))}
                </b>
              </div>
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div>
                    <label style={{ fontWeight: 700 }}>Efectivo</label>
                    <input
                      value={efectivo}
                      onChange={(e) =>
                        setEfectivo(e.target.value.replace(/\D/g, ""))
                      }
                      inputMode="numeric"
                      placeholder="0"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 700 }}>Transferencia</label>
                    <input
                      value={transferencia}
                      onChange={(e) =>
                        setTransferencia(
                          e.target.value.replace(/\D/g, "")
                        )
                      }
                      inputMode="numeric"
                      placeholder="0"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 700 }}>Tarjeta</label>
                    <input
                      value={tarjeta}
                      onChange={(e) =>
                        setTarjeta(e.target.value.replace(/\D/g, ""))
                      }
                      inputMode="numeric"
                      placeholder="0"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    style={{ ...primaryBtn, flex: 1 }}
                    onClick={cobrar}
                  >
                    Cobrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Pagados del día */}
      <section style={{ marginTop: 16 }}>
        <h3>Pagados ({pagadosArr.length})</h3>
        {pagadosArr.length === 0 ? (
          <p style={{ color: "#666" }}>Aún no hay pagos en el día.</p>
        ) : (
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha pedido</th>
                  <th>Cobrado en</th>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th className="num">Total</th>
                  <th className="ctr">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagadosArr.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Fecha pedido">{p.fechaTxt}</td>
                    <td data-label="Cobrado en">
                      {p.cobrado_at ? dispBogota(p.cobrado_at) : "-"}
                    </td>
                    <td data-label="N°">{num7(p.consecutivo)}</td>
                    <td data-label="Tipo">
                      {p.tipo === "Mesa"
                        ? `Mesa${p.mesa ? " #" + p.mesa : ""} — ${
                            p.cliente || "Clientes varios"
                          }`
                        : p.tipo === "Domicilio"
                        ? `Domicilio — ${p.cliente || "-"}`
                        : `Para llevar — ${
                            p.cliente || "Clientes varios"
                          }`}
                    </td>
                    <td data-label="Total" className="num">
                      {fmt(p.total)}
                    </td>
                    <td data-label="Acciones" className="ctr">
                      <div className="actionBtns">
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...primaryBtn,
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                          onClick={() => reimprimir(p)}
                        >
                          Imprimir
                        </button>
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...secondaryBtn,
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                          onClick={() => abrirEditarPago(p)}
                        >
                          Editar pago
                        </button>
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...secondaryBtn,
                            padding: "6px 10px",
                            fontSize: 12,
                            background: "#fef3c7",
                            borderColor: "#facc15",
                            color: "#92400e",
                          }}
                          onClick={async () => {
                            if (
                              !confirm(
                                "¿Devolver este pedido a cobro para modificar la forma de pago?"
                              )
                            )
                              return;
                            try {
                              await sbRevertirPago(p.id);
                              setPedidos((prev) =>
                                prev.map((x) =>
                                  x.id === p.id
                                    ? {
                                        ...x,
                                        estado: "pendiente",
                                        pagos: {
                                          efectivo: 0,
                                          transferencia: 0,
                                          tarjeta: 0,
                                        },
                                        cobrado_at: null,
                                      }
                                    : x
                                )
                              );
                              if (sel?.id === p.id) setSel(null);
                              if (editPagoPedido?.id === p.id)
                                setEditPagoPedido(null);
                              alert("Pedido devuelto a Cobro.");
                            } catch (e) {
                              console.error(e);
                              alert("No se pudo revertir el pago.");
                            }
                          }}
                        >
                          Revertir
                        </button>
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...btnRemove,
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                          onClick={() => eliminar(p.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Anuladas */}
      <section style={{ marginTop: 16 }}>
        <h3>Anuladas ({anuladasHoy.length})</h3>
        {anuladasHoy.length === 0 ? (
          <p style={{ color: "#666" }}>No hay pedidos anulados en el día.</p>
        ) : (
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha pedido</th>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th className="num">Total</th>
                  <th className="ctr">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {anuladasHoy.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Fecha pedido">{p.fechaTxt}</td>
                    <td data-label="N°">{num7(p.consecutivo)}</td>
                    <td data-label="Tipo">
                      {p.tipo === "Mesa"
                        ? `Mesa${p.mesa ? " #" + p.mesa : ""} — ${
                            p.cliente || "Clientes varios"
                          }`
                        : p.tipo === "Domicilio"
                        ? `Domicilio — ${p.cliente || "-"}`
                        : `Para llevar — ${
                            p.cliente || "Clientes varios"
                          }`}
                    </td>
                    <td data-label="Total" className="num">
                      {fmt(p.total)}
                    </td>
                    <td data-label="Acciones" className="ctr">
                      <div className="actionBtns">
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...btnRemove,
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                          onClick={() => eliminar(p.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Eliminadas */}
      <section style={{ marginTop: 16 }}>
        <h3>Eliminadas ({eliminadasHoy.length})</h3>
        {eliminadasHoy.length === 0 ? (
          <p style={{ color: "#666" }}>No hay pedidos eliminados en el día.</p>
        ) : (
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha pedido</th>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {eliminadasHoy.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Fecha pedido">{p.fechaTxt}</td>
                    <td data-label="N°">{num7(p.consecutivo)}</td>
                    <td data-label="Tipo">
                      {p.tipo === "Mesa"
                        ? `Mesa${p.mesa ? " #" + p.mesa : ""} — ${
                            p.cliente || "Clientes varios"
                          }`
                        : p.tipo === "Domicilio"
                        ? `Domicilio — ${p.cliente || "-"}`
                        : `Para llevar — ${
                            p.cliente || "Clientes varios"
                          }`}
                    </td>
                    <td data-label="Total" className="num">
                      {fmt(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Egresos */}
      <section style={{ marginTop: 16 }}>
        <h3>Egresos ({egresos.length}) — Total día: {fmt(totalEgresosDia)}</h3>
        {egresos.length === 0 ? (
          <p style={{ color: "#666" }}>No hay egresos registrados.</p>
        ) : (
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Referencia/Razón</th>
                  <th className="num">Valor</th>
                  <th className="ctr">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {egresos.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Fecha">{dispBogota(e.fecha)}</td>
                    <td data-label="Referencia/Razón">{e.motivo}</td>
                    <td data-label="Valor" className="num">
                      {fmt(e.monto)}
                    </td>
                    <td data-label="Acciones" className="ctr">
                      <div className="actionBtns">
                        <button
                          className="btnAction btnRow"
                          style={{
                            ...btnRemove,
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                          onClick={() => eliminarEgreso(e.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .cajaHeader{ display:grid; grid-template-columns:1fr auto; align-items:start; gap:12px; margin-bottom:12px }
        .cajaActions{ display:flex; flex-direction:column; gap:8px; align-items:stretch }
        @media (min-width:900px){ .cajaActions{ flex-direction:row; flex-wrap:wrap; align-items:center; justify-content:flex-end } }
        .cajaGrid{ display:grid; grid-template-columns:1fr; gap:16px }
        @media (min-width:900px){ .cajaGrid{ grid-template-columns:1fr 1fr } }
        .tableWrap{ width:100%; overflow:auto }
        .tbl{ width:100%; border-collapse:collapse; table-layout:fixed }
        .tbl th,.tbl td{ padding:8px; border-bottom:1px solid #eee; vertical-align:top; word-break:break-word; white-space:normal; font-size:14px }
        .tbl th{ background:#f9fafb; text-align:left }
        .tbl .num{ text-align:right } .tbl .ctr{ text-align:center }
        @media (max-width:480px){ .tbl th,.tbl td{ padding:6px; font-size:13px } }
      `}</style>

      {/* Modal Editar Pago */}
      {editPagoPedido && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 className="modal-title">
              Editar forma de pago — #{num7(editPagoPedido.consecutivo)}
            </h3>
            <p style={{ marginTop: 0, color: "#555", marginBottom: 6 }}>
              Fecha: {editPagoPedido.fechaTxt}
              <br />
              Tipo:{" "}
              {editPagoPedido.tipo === "Mesa"
                ? `Mesa${
                    editPagoPedido.mesa ? " #" + editPagoPedido.mesa : ""
                  }`
                : editPagoPedido.tipo === "Domicilio"
                ? `Domicilio — ${editPagoPedido.cliente || "-"}`
                : `Para llevar — ${
                    editPagoPedido.cliente || "Clientes varios"
                  }`}
            </p>

            <div
              className="tableWrap"
              style={{ maxHeight: "35vh", overflowY: "auto", marginBottom: 8 }}
            >
              <table className="tbl">
                <tbody>
                  {(editPagoPedido.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td data-label="Producto">
                        {it.nombre} x {it.cantidad}
                      </td>
                      <td data-label="Subtotal" className="num">
                        {fmt((it.precio || 0) * (it.cantidad || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span>Subtotal</span>
              <b>{fmt(editPagoPedido.subtotal || 0)}</b>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span>Descuento</span>
              <b>{fmt(editPagoPedido.descuento || 0)}</b>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              <span>
                <b>Total</b>
              </span>
              <b>
                {fmt(
                  (editPagoPedido.subtotal || 0) -
                    (editPagoPedido.descuento || 0)
                )}
              </b>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginTop: 4,
              }}
            >
              <div>
                <label style={{ fontWeight: 700 }}>Efectivo</label>
                <input
                  className="modal-input"
                  value={efectivo}
                  onChange={(e) =>
                    setEfectivo(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="0"
                  style={{ marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 700 }}>Transferencia</label>
                <input
                  className="modal-input"
                  value={transferencia}
                  onChange={(e) =>
                    setTransferencia(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="0"
                  style={{ marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 700 }}>Tarjeta</label>
                <input
                  className="modal-input"
                  value={tarjeta}
                  onChange={(e) =>
                    setTarjeta(e.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="0"
                  style={{ marginBottom: 0 }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setEditPagoPedido(null);
                  setEfectivo("");
                  setTransferencia("");
                  setTarjeta("");
                }}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={guardarEdicionPago}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Egreso */}
      {askEgreso && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 className="modal-title">Registrar egreso</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                className="modal-input"
                placeholder="Referencia o razón"
                value={egMotivo}
                onChange={(e) => setEgMotivo(e.target.value)}
              />
              <input
                className="modal-input"
                inputMode="numeric"
                placeholder="Valor"
                value={egMonto}
                onChange={(e) =>
                  setEgMonto(e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setAskEgreso(false)}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={guardarEgreso}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= Helpers ========= */
function ymdLocalFromDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function ymLocalFromDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}`;
}

/* ========= App ========= */
export default function App() {
  const [stack, setStack] = useState(["inicio"]); // "inicio" | "select" | "venta" | "caja" | "comandas"
  const [tipoSeleccionado, setTipoSeleccionado] = useState("Mesa");

  // Contraseña de Caja
  const [askPwd, setAskPwd] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  // Modo edición desde Comandas
  const [editPedido, setEditPedido] = useState(null);

  const current = stack[stack.length - 1];
  const go = (screen) => setStack((s) => [...s, screen]);
  const back = () =>
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const handleIrCaja = () => {
    setPwd("");
    setPwdErr("");
    setAskPwd(true);
  };
  const confirmarPwd = () => {
    if ((pwd || "").trim() === CLAVE_CAJA) {
      setAskPwd(false);
      go("caja");
    } else setPwdErr("Contraseña incorrecta.");
  };
  const onKeyDownPwd = (e) => {
    if (e.key === "Enter") confirmarPwd();
  };

  return (
    <>
      <GlobalStyles />
      {current === "inicio" && (
        <Inicio
          onVender={() => go("select")}
          onCaja={handleIrCaja}
          onComandas={() => go("comandas")}
        />
      )}
      {current === "select" && (
        <SeleccionTipo
          onElegir={(tipo) => {
            setTipoSeleccionado(tipo);
            go("venta");
          }}
          onVolver={back}
        />
      )}
      {current === "venta" && (
        <Venta
          initialTipo={tipoSeleccionado}
          editPedido={editPedido}
          onVolver={() => {
            if (editPedido) {
              setEditPedido(null);
              setStack(["comandas"]);
            } else back();
          }}
          onPedidoRealizado={() => setStack(["inicio"])}
          onPedidoEditado={() => {
            setEditPedido(null);
            setStack(["comandas"]);
          }}
        />
      )}
      {current === "caja" && <Caja onVolver={back} />}
      {current === "comandas" && (
        <Comandas
          onVolver={() => setStack(["inicio"])}
          onEditarPedido={(p) => {
            if (p.estado !== "pendiente") {
              alert("Solo se pueden editar pedidos pendientes.");
              return;
            }
            setEditPedido({
              id: p.id,
              consecutivo: p.consecutivo,
              tipo: p.tipo,
              mesa: p.mesa,
              cliente: p.cliente,
              documento: p.documento,
              telefono: p.telefono,
              direccion: p.direccion,
              subtotal: p.subtotal || 0,
              descuento: p.descuento || 0,
              items: (p.items || []).map((it) => ({ ...it })),
            });
            setStack(["venta"]);
          }}
        />
      )}

      <div className="watermark-daga">By DAGA 2025</div>

      {/* Modal Contraseña Caja */}
      {askPwd && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3 className="modal-title">Ingresar a Caja</h3>
            <p style={{ marginTop: 0, color: "#555" }}>
              Digite la contraseña para continuar.
            </p>
            <input
              className="modal-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              enterKeyHint="done"
              placeholder="Contraseña"
              value={pwd}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setPwd(v);
                if (pwdErr) setPwdErr("");
              }}
              onKeyDown={onKeyDownPwd}
              autoFocus
            />
            {pwdErr && <div className="modal-error">{pwdErr}</div>}
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setAskPwd(false)}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarPwd}>
                Ingresar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
