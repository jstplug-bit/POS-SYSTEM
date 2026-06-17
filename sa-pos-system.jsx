import { useState, useEffect, useRef } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────
const ZAR = (n) =>
  `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const now = () => new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const TAX_RATE = 0.15; // SA VAT 15%

// ── Initial seed data ────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: "u1", name: "Admin User", pin: "1234", role: "admin" },
  { id: "u2", name: "Supervisor", pin: "5678", role: "supervisor" },
  { id: "u3", name: "Cashier 1", pin: "0000", role: "cashier" },
];

const SEED_STOCK = [
  { id: "s1", name: "Coca-Cola 330ml", category: "Drinks", price: 18, cost: 9, qty: 50, unit: "can", barcode: "001", destination: "bar" },
  { id: "s2", name: "Heineken 340ml", category: "Beer", price: 35, cost: 18, qty: 48, unit: "bottle", barcode: "002", destination: "bar" },
  { id: "s3", name: "House Burger", category: "Food", price: 120, cost: 45, qty: 30, unit: "portion", barcode: "003", destination: "kitchen" },
  { id: "s4", name: "Chicken Wrap", category: "Food", price: 95, cost: 35, qty: 25, unit: "portion", barcode: "004", destination: "kitchen" },
  { id: "s5", name: "Chips", category: "Food", price: 45, cost: 12, qty: 40, unit: "portion", barcode: "005", destination: "kitchen" },
  { id: "s6", name: "Still Water 500ml", category: "Drinks", price: 15, cost: 5, qty: 100, unit: "bottle", barcode: "006", destination: "bar" },
  { id: "s7", name: "Red Bull 250ml", category: "Drinks", price: 38, cost: 18, qty: 60, unit: "can", barcode: "007", destination: "bar" },
  { id: "s8", name: "Caesar Salad", category: "Food", price: 85, cost: 28, qty: 20, unit: "portion", barcode: "008", destination: "kitchen" },
];

const SEED_SALES = [];

// ── Storage helpers ──────────────────────────────────────────────────────────
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function POSSystem() {
  const [users, setUsers] = useState(() => load("pos_users", SEED_USERS));
  const [stock, setStock] = useState(() => load("pos_stock", SEED_STOCK));
  const [sales, setSales] = useState(() => load("pos_sales", SEED_SALES));
  const [kitchenOrders, setKitchenOrders] = useState(() => load("pos_kitchen", []));
  const [barOrders, setBarOrders] = useState(() => load("pos_bar", []));

  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState("login"); // login | pos | stock | sales | users | kitchen | bar | admin
  const [cart, setCart] = useState([]);
  const [tableNo, setTableNo] = useState("T1");
  const [orderNote, setOrderNote] = useState("");

  // Persist
  useEffect(() => { save("pos_users", users); }, [users]);
  useEffect(() => { save("pos_stock", stock); }, [stock]);
  useEffect(() => { save("pos_sales", sales); }, [sales]);
  useEffect(() => { save("pos_kitchen", kitchenOrders); }, [kitchenOrders]);
  useEffect(() => { save("pos_bar", barOrders); }, [barOrders]);

  // ── cart helpers ────────────────────────────────────────────────────────────
  const addToCart = (item) => {
    if (item.qty <= 0) return alert("Out of stock!");
    setCart((c) => {
      const ex = c.find((x) => x.id === item.id);
      if (ex) return c.map((x) => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...item, qty: 1 }];
    });
  };
  const removeFromCart = (id) => setCart((c) => c.filter((x) => x.id !== id));
  const updateCartQty = (id, qty) => {
    if (qty <= 0) return removeFromCart(id);
    setCart((c) => c.map((x) => x.id === id ? { ...x, qty } : x));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const vatAmt = subtotal * TAX_RATE / (1 + TAX_RATE);
  const total = subtotal;

  // ── complete sale ───────────────────────────────────────────────────────────
  const completeSale = (method) => {
    if (cart.length === 0) return;
    const saleId = uid();
    const saleTime = now();
    const saleItems = cart.map((i) => ({ ...i }));

    // Deduct stock
    setStock((s) =>
      s.map((item) => {
        const ci = saleItems.find((x) => x.id === item.id);
        return ci ? { ...item, qty: Math.max(0, item.qty - ci.qty) } : item;
      })
    );

    // Save sale
    const sale = {
      id: saleId, date: saleTime, items: saleItems,
      subtotal, vat: vatAmt, total, payment: method,
      cashier: currentUser.name, table: tableNo, note: orderNote,
    };
    setSales((s) => [sale, ...s]);

    // Send to kitchen / bar
    const kitItems = saleItems.filter((i) => i.destination === "kitchen");
    const barItems = saleItems.filter((i) => i.destination === "bar");
    if (kitItems.length)
      setKitchenOrders((o) => [{ id: saleId, table: tableNo, items: kitItems, time: saleTime, status: "pending", note: orderNote }, ...o]);
    if (barItems.length)
      setBarOrders((o) => [{ id: saleId, table: tableNo, items: barItems, time: saleTime, status: "pending", note: orderNote }, ...o]);

    setCart([]);
    setOrderNote("");
    alert(`✅ Sale ${saleId} complete!\nTotal: ${ZAR(total)}\nPayment: ${method}`);
  };

  // ── void order ──────────────────────────────────────────────────────────────
  const [voidModal, setVoidModal] = useState(false);
  const [voidPin, setVoidPin] = useState("");
  const voidOrder = () => {
    const auth = users.find((u) => u.pin === voidPin && (u.role === "admin" || u.role === "supervisor"));
    if (!auth) return alert("Invalid supervisor/admin PIN");
    setCart([]);
    setVoidPin("");
    setVoidModal(false);
    alert("Order voided.");
  };

  // ── nav tabs ────────────────────────────────────────────────────────────────
  const canAccess = (s) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    if (currentUser.role === "supervisor") return s !== "users";
    return ["pos", "kitchen", "bar"].includes(s);
  };

  if (screen === "login" || !currentUser)
    return <LoginScreen users={users} onLogin={(u) => { setCurrentUser(u); setScreen("pos"); }} />;

  return (
    <div style={{ fontFamily: "'Segoe UI',sans-serif", minHeight: "100vh", background: "#0f172a", color: "#f1f5f9" }}>
      {/* Header */}
      <div style={{ background: "#1e293b", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #f59e0b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>🇿🇦 SA POS</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{now()}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["pos", "stock", "sales", "kitchen", "bar", "users", "admin"].map((s) =>
            canAccess(s) && (
              <button key={s} onClick={() => setScreen(s)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: screen === s ? "#f59e0b" : "#334155", color: screen === s ? "#000" : "#f1f5f9" }}>
                {{ pos: "🛒 POS", stock: "📦 Stock", sales: "🧾 Sales", kitchen: "🍳 Kitchen", bar: "🍺 Bar", users: "👤 Users", admin: "⚙️ Admin" }[s]}
              </button>
            )
          )}
          <button onClick={() => { setCurrentUser(null); setScreen("login"); setCart([]); }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, background: "#ef4444", color: "#fff", fontWeight: 600 }}>
            Logout
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          👤 {currentUser.name} <span style={{ color: "#f59e0b" }}>({currentUser.role})</span>
        </div>
      </div>

      {/* Screens */}
      <div style={{ padding: 16 }}>
        {screen === "pos" && (
          <POSScreen stock={stock} cart={cart} addToCart={addToCart} removeFromCart={removeFromCart}
            updateCartQty={updateCartQty} subtotal={subtotal} vatAmt={vatAmt} total={total}
            completeSale={completeSale} tableNo={tableNo} setTableNo={setTableNo}
            orderNote={orderNote} setOrderNote={setOrderNote}
            onVoid={() => setVoidModal(true)} />
        )}
        {screen === "stock" && <StockScreen stock={stock} setStock={setStock} />}
        {screen === "sales" && <SalesScreen sales={sales} />}
        {screen === "kitchen" && <KitchenScreen orders={kitchenOrders} setOrders={setKitchenOrders} />}
        {screen === "bar" && <BarScreen orders={barOrders} setOrders={setBarOrders} />}
        {screen === "users" && currentUser.role === "admin" && <UsersScreen users={users} setUsers={setUsers} />}
        {screen === "admin" && <AdminScreen stock={stock} sales={sales} users={users} />}
      </div>

      {/* Void modal */}
      {voidModal && (
        <Modal title="🚫 Void Order — Authorisation Required" onClose={() => { setVoidModal(false); setVoidPin(""); }}>
          <p style={{ color: "#94a3b8", marginBottom: 12 }}>Supervisor or Admin PIN required to void this order.</p>
          <PinPad pin={voidPin} setPin={setVoidPin} onSubmit={voidOrder} label="Enter PIN" />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ users, onLogin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const attempt = () => {
    const u = users.find((x) => x.pin === pin);
    if (u) { setError(""); onLogin(u); }
    else { setError("Invalid PIN. Try again."); setPin(""); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e293b", borderRadius: 16, padding: 40, width: 320, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid #334155" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🇿🇦</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#f59e0b" }}>SA POS System</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Point of Sale — South Africa</div>
        </div>
        <PinPad pin={pin} setPin={setPin} onSubmit={attempt} label="Enter PIN to login" />
        {error && <p style={{ color: "#ef4444", textAlign: "center", marginTop: 8, fontSize: 13 }}>{error}</p>}
        <p style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 16 }}>Default PINs: Admin=1234 | Sup=5678 | Cashier=0000</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function POSScreen({ stock, cart, addToCart, removeFromCart, updateCartQty, subtotal, vatAmt, total, completeSale, tableNo, setTableNo, orderNote, setOrderNote, onVoid }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [payModal, setPayModal] = useState(false);
  const categories = ["All", ...new Set(stock.map((s) => s.category))];
  const filtered = stock.filter((s) => (cat === "All" || s.category === cat) && s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, height: "calc(100vh - 100px)" }}>
      {/* Left: menu */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search items..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 14 }} />
          <select value={tableNo} onChange={(e) => setTableNo(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 14 }}>
            {["T1","T2","T3","T4","T5","T6","Bar","Takeaway"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {/* Category pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: cat === c ? "#f59e0b" : "#1e293b", color: cat === c ? "#000" : "#94a3b8" }}>
              {c}
            </button>
          ))}
        </div>
        {/* Items grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, overflowY: "auto", flex: 1 }}>
          {filtered.map((item) => (
            <button key={item.id} onClick={() => addToCart(item)}
              style={{ background: item.qty === 0 ? "#1e293b" : "#1e293b", border: `1px solid ${item.qty === 0 ? "#ef4444" : "#334155"}`,
                borderRadius: 10, padding: 12, cursor: item.qty === 0 ? "not-allowed" : "pointer", textAlign: "left",
                opacity: item.qty === 0 ? 0.5 : 1, transition: "all 0.15s" }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{item.category}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{item.name}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>{ZAR(item.price)}</div>
              <div style={{ fontSize: 11, color: item.qty < 5 ? "#ef4444" : "#22c55e" }}>Stock: {item.qty}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: cart */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", border: "1px solid #334155" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, color: "#f59e0b" }}>
          🛒 Order — {tableNo}
        </div>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {cart.length === 0 && <p style={{ color: "#475569", textAlign: "center", marginTop: 40 }}>No items added</p>}
          {cart.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, background: "#0f172a", borderRadius: 8 }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>{ZAR(item.price)} each</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => updateCartQty(item.id, item.qty - 1)} style={btnSm("#334155")}>-</button>
                <span style={{ minWidth: 22, textAlign: "center", fontSize: 14 }}>{item.qty}</span>
                <button onClick={() => updateCartQty(item.id, item.qty + 1)} style={btnSm("#334155")}>+</button>
              </div>
              <div style={{ minWidth: 60, textAlign: "right", fontWeight: 700, color: "#f59e0b", fontSize: 14 }}>{ZAR(item.price * item.qty)}</div>
              <button onClick={() => removeFromCart(item.id)} style={{ ...btnSm("#ef4444"), color: "#fff" }}>✕</button>
            </div>
          ))}
        </div>
        {/* Note */}
        <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Order note (e.g. no onion)..."
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 12, marginBottom: 10 }} />
        {/* Totals */}
        <div style={{ borderTop: "1px solid #334155", paddingTop: 10, marginBottom: 12 }}>
          <Row label="Subtotal (incl. VAT)" val={ZAR(subtotal)} />
          <Row label={`VAT (15%)`} val={ZAR(vatAmt)} small />
          <Row label="TOTAL" val={ZAR(total)} bold />
        </div>
        {/* Buttons */}
        <button onClick={() => setPayModal(true)} disabled={cart.length === 0}
          style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", cursor: cart.length === 0 ? "not-allowed" : "pointer",
            background: cart.length === 0 ? "#334155" : "#22c55e", color: "#000", fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
          💳 PAY — {ZAR(total)}
        </button>
        <button onClick={onVoid} disabled={cart.length === 0}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14 }}>
          🚫 Void Order
        </button>
      </div>

      {payModal && <PaymentModal total={total} onPay={(m) => { completeSale(m); setPayModal(false); }} onClose={() => setPayModal(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function PaymentModal({ total, onPay, onClose }) {
  const [method, setMethod] = useState("Cash");
  const [cashTendered, setCashTendered] = useState("");
  const change = method === "Cash" && cashTendered ? Math.max(0, parseFloat(cashTendered) - total) : 0;
  return (
    <Modal title="💳 Select Payment Method" onClose={onClose}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {["Cash", "Card", "EFT", "SnapScan", "Zapper"].map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
              background: method === m ? "#f59e0b" : "#334155", color: method === m ? "#000" : "#f1f5f9" }}>
            {m}
          </button>
        ))}
      </div>
      <div style={{ background: "#0f172a", padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <Row label="Total Due" val={ZAR(total)} bold />
        {method === "Cash" && (
          <>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 13, color: "#94a3b8" }}>Cash Tendered (R)</label>
              <input type="number" value={cashTendered} onChange={(e) => setCashTendered(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9", fontSize: 16, marginTop: 4 }} />
            </div>
            {cashTendered && <Row label="Change" val={ZAR(change)} style={{ marginTop: 8 }} bold />}
          </>
        )}
      </div>
      <button onClick={() => onPay(method)}
        style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: "#22c55e", color: "#000", fontWeight: 800, fontSize: 16 }}>
        ✅ Confirm Payment — {method}
      </button>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STOCK SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function StockScreen({ stock, setStock }) {
  const [showAdd, setShowAdd] = useState(false);
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", category: "", price: "", cost: "", qty: "", unit: "portion", barcode: "", destination: "kitchen" });

  const saveItem = () => {
    if (!form.name || !form.price) return alert("Name and price required");
    if (edit) {
      setStock((s) => s.map((x) => x.id === edit ? { ...x, ...form, price: +form.price, cost: +form.cost, qty: +form.qty } : x));
      setEdit(null);
    } else {
      setStock((s) => [...s, { ...form, id: uid(), price: +form.price, cost: +form.cost, qty: +form.qty }]);
    }
    setForm({ name: "", category: "", price: "", cost: "", qty: "", unit: "portion", barcode: "", destination: "kitchen" });
    setShowAdd(false);
  };
  const deleteItem = (id) => { if (confirm("Delete item?")) setStock((s) => s.filter((x) => x.id !== id)); };
  const adjustQty = (id, delta) => setStock((s) => s.map((x) => x.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x));

  const filtered = stock.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#f59e0b" }}>📦 Stock Management</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9" }} />
        <button onClick={() => { setShowAdd(true); setEdit(null); setForm({ name: "", category: "", price: "", cost: "", qty: "", unit: "portion", barcode: "", destination: "kitchen" }); }}
          style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#f59e0b", color: "#000", fontWeight: 700 }}>
          + Add Item
        </button>
      </div>

      {(showAdd || edit !== null) && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
          <h3 style={{ margin: "0 0 14px", color: "#f59e0b" }}>{edit ? "Edit Item" : "New Stock Item"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
            {[["name","Item Name"],["category","Category"],["barcode","Barcode"],["unit","Unit"]].map(([k,l]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: "#94a3b8" }}>{l}</label>
                <input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 13 }} />
              </div>
            ))}
            {[["price","Selling Price (R)"],["cost","Cost Price (R)"],["qty","Qty in Stock"]].map(([k,l]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: "#94a3b8" }}>{l}</label>
                <input type="number" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 13 }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8" }}>Send to</label>
              <select value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 13 }}>
                <option value="kitchen">Kitchen</option>
                <option value="bar">Bar</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={saveItem} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "#22c55e", color: "#000", fontWeight: 700 }}>
              {edit ? "Save Changes" : "Add Item"}
            </button>
            <button onClick={() => { setShowAdd(false); setEdit(null); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "#334155", color: "#f1f5f9" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              {["Barcode","Name","Category","Destination","Sell Price","Cost","Margin","Stock","Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#f59e0b", fontWeight: 700, borderBottom: "2px solid #334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
              const margin = item.price > 0 ? ((item.price - item.cost) / item.price * 100).toFixed(1) : 0;
              return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#0f172a" : "#1a2435" }}>
                  <td style={td}>{item.barcode}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{item.name}</td>
                  <td style={td}>{item.category}</td>
                  <td style={td}><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: item.destination === "kitchen" ? "#854d0e" : "#1e3a5f", color: "#fcd34d" }}>{item.destination}</span></td>
                  <td style={{ ...td, color: "#f59e0b", fontWeight: 700 }}>{ZAR(item.price)}</td>
                  <td style={td}>{ZAR(item.cost)}</td>
                  <td style={{ ...td, color: margin >= 50 ? "#22c55e" : "#f59e0b" }}>{margin}%</td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => adjustQty(item.id, -1)} style={btnSm("#334155")}>-</button>
                      <span style={{ color: item.qty < 5 ? "#ef4444" : "#22c55e", fontWeight: 700, minWidth: 28, textAlign: "center" }}>{item.qty}</span>
                      <button onClick={() => adjustQty(item.id, 1)} style={btnSm("#334155")}>+</button>
                    </div>
                  </td>
                  <td style={td}>
                    <button onClick={() => { setEdit(item.id); setShowAdd(false); setForm({ ...item, price: String(item.price), cost: String(item.cost), qty: String(item.qty) }); }}
                      style={{ ...btnSm("#1d4ed8"), marginRight: 4 }}>✏️</button>
                    <button onClick={() => deleteItem(item.id)} style={btnSm("#ef4444")}>🗑</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALES HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
function SalesScreen({ sales }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const printRef = useRef();

  const filtered = sales.filter((s) =>
    s.id.includes(search.toUpperCase()) || s.cashier.toLowerCase().includes(search.toLowerCase()) || s.table.toLowerCase().includes(search.toLowerCase())
  );
  const totalRevenue = filtered.reduce((s, x) => s + x.total, 0);

  const printReceipt = (sale) => {
    const w = window.open("", "", "width=400,height=600");
    w.document.write(`
      <html><head><title>Receipt</title>
      <style>body{font-family:monospace;width:300px;margin:auto;font-size:13px}h2{text-align:center}.line{display:flex;justify-content:space-between;margin:2px 0}hr{border:1px dashed #000}</style>
      </head><body>
      <h2>🇿🇦 SA POS</h2><hr>
      <div class="line"><span>Receipt #:</span><span>${sale.id}</span></div>
      <div class="line"><span>Date:</span><span>${sale.date}</span></div>
      <div class="line"><span>Table:</span><span>${sale.table}</span></div>
      <div class="line"><span>Cashier:</span><span>${sale.cashier}</span></div>
      <hr>
      ${sale.items.map((i) => `<div class="line"><span>${i.name} x${i.qty}</span><span>R ${(i.price * i.qty).toFixed(2)}</span></div>`).join("")}
      <hr>
      <div class="line"><span>Subtotal (incl VAT):</span><span>R ${sale.subtotal.toFixed(2)}</span></div>
      <div class="line"><span>VAT (15%):</span><span>R ${sale.vat.toFixed(2)}</span></div>
      <div class="line"><strong>TOTAL:</strong><strong>R ${sale.total.toFixed(2)}</strong></div>
      <div class="line"><span>Payment:</span><span>${sale.payment}</span></div>
      <hr>
      <p style="text-align:center">Thank you for your visit!<br>Reg No: 2024/000001/07<br>VAT Reg: 4580123456</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const printAll = () => {
    const w = window.open("", "", "width=900,height=700");
    w.document.write(`<html><head><title>Sales Report</title>
      <style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f59e0b}</style>
      </head><body>
      <h2>🇿🇦 SA POS — Sales Report</h2><p>Generated: ${now()}</p>
      <table><tr><th>ID</th><th>Date</th><th>Table</th><th>Cashier</th><th>Items</th><th>Total</th><th>Payment</th></tr>
      ${filtered.map((s) => `<tr><td>${s.id}</td><td>${s.date}</td><td>${s.table}</td><td>${s.cashier}</td><td>${s.items.map(i => i.name + " x" + i.qty).join(", ")}</td><td>R ${s.total.toFixed(2)}</td><td>${s.payment}</td></tr>`).join("")}
      <tr><td colspan="5"><strong>TOTAL</strong></td><td><strong>R ${totalRevenue.toFixed(2)}</strong></td><td></td></tr>
      </table></body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#f59e0b" }}>🧾 Sales History</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID / cashier / table..."
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f1f5f9" }} />
        <button onClick={printAll} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#1d4ed8", color: "#fff", fontWeight: 700 }}>
          🖨 Print Report
        </button>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <StatCard label="Total Sales" val={filtered.length} color="#f59e0b" />
        <StatCard label="Revenue" val={ZAR(totalRevenue)} color="#22c55e" />
        <StatCard label="Avg Order" val={filtered.length ? ZAR(totalRevenue / filtered.length) : ZAR(0)} color="#3b82f6" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              {["ID","Date","Table","Cashier","Total","Payment","Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#f59e0b", fontWeight: 700, borderBottom: "2px solid #334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((sale, i) => (
              <>
                <tr key={sale.id} style={{ background: i % 2 === 0 ? "#0f172a" : "#1a2435", cursor: "pointer" }} onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}>
                  <td style={{ ...td, fontWeight: 700, color: "#f59e0b" }}>{sale.id}</td>
                  <td style={td}>{sale.date}</td>
                  <td style={td}>{sale.table}</td>
                  <td style={td}>{sale.cashier}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{ZAR(sale.total)}</td>
                  <td style={td}><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#1e3a5f" }}>{sale.payment}</span></td>
                  <td style={td}>
                    <button onClick={(e) => { e.stopPropagation(); printReceipt(sale); }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#1d4ed8", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      🖨 Print
                    </button>
                  </td>
                </tr>
                {expanded === sale.id && (
                  <tr key={`${sale.id}-exp`} style={{ background: "#0f172a" }}>
                    <td colSpan={7} style={{ padding: "12px 20px" }}>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        <strong style={{ color: "#f1f5f9" }}>Items: </strong>
                        {sale.items.map((it) => `${it.name} x${it.qty} (${ZAR(it.price * it.qty)})`).join(" · ")}
                        {sale.note && <> · <strong>Note:</strong> {sale.note}</>}
                        <span style={{ marginLeft: 12 }}>VAT: {ZAR(sale.vat)}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ textAlign: "center", color: "#475569", marginTop: 40 }}>No sales recorded yet</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KITCHEN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function KitchenScreen({ orders, setOrders }) {
  const pending = orders.filter((o) => o.status === "pending");
  const done = orders.filter((o) => o.status === "done");
  const markDone = (id) => setOrders((o) => o.map((x) => x.id === id ? { ...x, status: "done" } : x));

  return (
    <div>
      <h2 style={{ color: "#f59e0b", marginBottom: 16 }}>🍳 Kitchen Screen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3 style={{ color: "#ef4444", marginBottom: 10 }}>⏳ Pending ({pending.length})</h3>
          {pending.length === 0 && <p style={{ color: "#475569" }}>All orders done!</p>}
          {pending.map((o) => (
            <div key={o.id} style={{ background: "#1e293b", borderRadius: 10, padding: 14, marginBottom: 10, borderLeft: "4px solid #ef4444" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 16 }}>Table {o.table}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{o.time}</span>
              </div>
              {o.note && <p style={{ background: "#ef4444", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 12, marginBottom: 8 }}>⚠️ {o.note}</p>}
              {o.items.map((it) => <div key={it.id} style={{ fontSize: 14, marginBottom: 4 }}>• {it.name} <strong>x{it.qty}</strong></div>)}
              <button onClick={() => markDone(o.id)}
                style={{ marginTop: 10, padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#22c55e", color: "#000", fontWeight: 700 }}>
                ✅ Mark Ready
              </button>
            </div>
          ))}
        </div>
        <div>
          <h3 style={{ color: "#22c55e", marginBottom: 10 }}>✅ Completed ({done.length})</h3>
          {done.slice(0, 8).map((o) => (
            <div key={o.id} style={{ background: "#1e293b", borderRadius: 10, padding: 10, marginBottom: 8, borderLeft: "4px solid #22c55e", opacity: 0.7 }}>
              <span style={{ fontWeight: 700, color: "#f59e0b" }}>Table {o.table}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 10 }}>{o.time}</span>
              <div style={{ fontSize: 12, color: "#64748b" }}>{o.items.map((it) => `${it.name} x${it.qty}`).join(", ")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BAR SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function BarScreen({ orders, setOrders }) {
  const pending = orders.filter((o) => o.status === "pending");
  const done = orders.filter((o) => o.status === "done");
  const markDone = (id) => setOrders((o) => o.map((x) => x.id === id ? { ...x, status: "done" } : x));

  return (
    <div>
      <h2 style={{ color: "#f59e0b", marginBottom: 16 }}>🍺 Bar Screen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3 style={{ color: "#ef4444", marginBottom: 10 }}>⏳ Pending ({pending.length})</h3>
          {pending.length === 0 && <p style={{ color: "#475569" }}>All orders done!</p>}
          {pending.map((o) => (
            <div key={o.id} style={{ background: "#1e293b", borderRadius: 10, padding: 14, marginBottom: 10, borderLeft: "4px solid #3b82f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 16 }}>Table {o.table}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{o.time}</span>
              </div>
              {o.note && <p style={{ background: "#1d4ed8", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 12, marginBottom: 8 }}>ℹ️ {o.note}</p>}
              {o.items.map((it) => <div key={it.id} style={{ fontSize: 14, marginBottom: 4 }}>• {it.name} <strong>x{it.qty}</strong></div>)}
              <button onClick={() => markDone(o.id)}
                style={{ marginTop: 10, padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#22c55e", color: "#000", fontWeight: 700 }}>
                ✅ Mark Ready
              </button>
            </div>
          ))}
        </div>
        <div>
          <h3 style={{ color: "#22c55e", marginBottom: 10 }}>✅ Served ({done.length})</h3>
          {done.slice(0, 8).map((o) => (
            <div key={o.id} style={{ background: "#1e293b", borderRadius: 10, padding: 10, marginBottom: 8, borderLeft: "4px solid #22c55e", opacity: 0.7 }}>
              <span style={{ fontWeight: 700, color: "#f59e0b" }}>Table {o.table}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 10 }}>{o.time}</span>
              <div style={{ fontSize: 12, color: "#64748b" }}>{o.items.map((it) => `${it.name} x${it.qty}`).join(", ")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS SCREEN (Admin only)
// ═══════════════════════════════════════════════════════════════════════════════
function UsersScreen({ users, setUsers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", pin: "", role: "cashier" });
  const saveUser = () => {
    if (!form.name || form.pin.length < 4) return alert("Name and 4-digit PIN required");
    if (users.find((u) => u.pin === form.pin)) return alert("PIN already in use");
    setUsers((u) => [...u, { ...form, id: uid() }]);
    setForm({ name: "", pin: "", role: "cashier" });
    setShowAdd(false);
  };
  const deleteUser = (id) => {
    if (users.length === 1) return alert("Cannot delete last user");
    if (confirm("Delete user?")) setUsers((u) => u.filter((x) => x.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#f59e0b" }}>👤 User Management</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#f59e0b", color: "#000", fontWeight: 700 }}>
          + Add User
        </button>
      </div>
      {showAdd && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8" }}>Full Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ display: "block", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8" }}>4-digit PIN</label>
              <input type="password" maxLength={4} value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                style={{ display: "block", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#94a3b8" }}>Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                style={{ display: "block", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9" }}>
                <option value="cashier">Cashier</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={saveUser} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "#22c55e", color: "#000", fontWeight: 700 }}>Save User</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "#334155", color: "#f1f5f9" }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {users.map((u) => (
          <div key={u.id} style={{ background: "#1e293b", borderRadius: 10, padding: 16, border: "1px solid #334155" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{u.role === "admin" ? "👑" : u.role === "supervisor" ? "🔑" : "👤"}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{u.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>ID: {u.id}</div>
            <div style={{ display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, marginTop: 6,
              background: u.role === "admin" ? "#854d0e" : u.role === "supervisor" ? "#1e3a5f" : "#1e293b",
              color: u.role === "admin" ? "#fcd34d" : u.role === "supervisor" ? "#93c5fd" : "#94a3b8" }}>
              {u.role.toUpperCase()}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
              <button onClick={() => deleteUser(u.id)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff", fontSize: 12 }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function AdminScreen({ stock, sales, users }) {
  const today = new Date().toLocaleDateString("en-ZA");
  const todaySales = sales.filter((s) => s.date.startsWith(today.split("/").reverse().join("/")));
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const lowStock = stock.filter((s) => s.qty < 5);
  const payBreakdown = ["Cash","Card","EFT","SnapScan","Zapper"].map((m) => ({
    method: m, count: sales.filter((s) => s.payment === m).length,
    total: sales.filter((s) => s.payment === m).reduce((s, x) => s + x.total, 0)
  }));

  return (
    <div>
      <h2 style={{ color: "#f59e0b", marginBottom: 16 }}>⚙️ Admin Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Today's Revenue" val={ZAR(todayRevenue)} color="#22c55e" />
        <StatCard label="Today's Sales" val={todaySales.length} color="#f59e0b" />
        <StatCard label="All-time Revenue" val={ZAR(totalRevenue)} color="#3b82f6" />
        <StatCard label="Total Sales" val={sales.length} color="#8b5cf6" />
        <StatCard label="Stock Items" val={stock.length} color="#06b6d4" />
        <StatCard label="Staff" val={users.length} color="#ec4899" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, border: "1px solid #334155" }}>
          <h3 style={{ color: "#f59e0b", marginTop: 0 }}>💳 Payment Breakdown</h3>
          {payBreakdown.map((p) => p.count > 0 && (
            <div key={p.method} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #334155", fontSize: 14 }}>
              <span>{p.method}</span>
              <span>{p.count} sales — <strong>{ZAR(p.total)}</strong></span>
            </div>
          ))}
          {payBreakdown.every((p) => p.count === 0) && <p style={{ color: "#475569" }}>No sales yet</p>}
        </div>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, border: "1px solid #334155" }}>
          <h3 style={{ color: "#ef4444", marginTop: 0 }}>⚠️ Low Stock Alerts</h3>
          {lowStock.length === 0 && <p style={{ color: "#22c55e" }}>✅ All stock levels OK</p>}
          {lowStock.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #334155", fontSize: 14 }}>
              <span>{s.name}</span>
              <span style={{ color: "#ef4444", fontWeight: 700 }}>{s.qty} left</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginTop: 16, border: "1px solid #334155" }}>
        <h3 style={{ color: "#f59e0b", marginTop: 0 }}>📋 Business Info</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, fontSize: 13, color: "#94a3b8" }}>
          <div>🇿🇦 <strong>Country:</strong> South Africa</div>
          <div>💰 <strong>Currency:</strong> ZAR (Rand)</div>
          <div>📊 <strong>VAT Rate:</strong> 15%</div>
          <div>🕐 <strong>Timezone:</strong> SAST (UTC+2)</div>
          <div>📝 <strong>VAT Reg:</strong> 4580123456</div>
          <div>🏢 <strong>Reg No:</strong> 2024/000001/07</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function PinPad({ pin, setPin, onSubmit, label }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {[0,1,2,3].map((i) => (
          <div key={i} style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
            {pin[i] ? "●" : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
          <button key={i} onClick={() => {
            if (k === "⌫") setPin((p) => p.slice(0,-1));
            else if (k !== "" && pin.length < 4) setPin((p) => p + k);
          }} disabled={k === ""}
            style={{ padding: 14, borderRadius: 10, border: "1px solid #334155", cursor: k === "" ? "default" : "pointer", fontSize: 18, fontWeight: 700,
              background: k === "⌫" ? "#334155" : "#1e293b", color: "#f1f5f9", opacity: k === "" ? 0 : 1 }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onSubmit} disabled={pin.length < 4}
        style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", cursor: pin.length < 4 ? "not-allowed" : "pointer",
          background: pin.length < 4 ? "#334155" : "#f59e0b", color: "#000", fontWeight: 800, fontSize: 16 }}>
        {label || "Enter"}
      </button>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#1e293b", borderRadius: 16, padding: 24, minWidth: 320, maxWidth: 480, width: "90%", border: "1px solid #334155", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#f59e0b" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, val, bold, small }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: small ? 12 : 14 }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 500, color: bold ? "#f59e0b" : "#f1f5f9" }}>{val}</span>
    </div>
  );
}

function StatCard({ label, val, color }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${color}`, border: `1px solid #334155`, borderLeftColor: color }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
    </div>
  );
}

const td = { padding: "10px 12px", borderBottom: "1px solid #1e293b" };
const btnSm = (bg) => ({ padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: bg, color: "#f1f5f9", fontSize: 12, fontWeight: 600 });
