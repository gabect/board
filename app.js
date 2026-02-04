// app.js (ESM) — limpio para GitHub Pages (sin duplicados)

// =========================
// 0) Firebase imports (ESM desde gstatic)
// =========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =========================
// 1) Firebase config (TUYO)
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyA3KERRbb2kWbAWOGCg2Pg_P2-zbIeIECU",
  authDomain: "board-43bf1.firebaseapp.com",
  projectId: "board-43bf1",
  storageBucket: "board-43bf1.firebasestorage.app",
  messagingSenderId: "1010492433940",
  appId: "1:1010492433940:web:dbdd5cba6841cb9c10a901",
  measurementId: "G-4ELQ6D88G1"
};

// =========================
// 2) Init Firebase
// =========================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =========================
// 3) DOM refs
// =========================
const board = document.getElementById("board");
const boardHint = document.getElementById("boardHint");

const btnLoginGoogle = document.getElementById("btnLoginGoogle");
const btnLogout = document.getElementById("btnLogout");

const userBadge = document.getElementById("userBadge");
const userPhoto = document.getElementById("userPhoto");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const noteText = document.getElementById("noteText");
const noteColor = document.getElementById("noteColor");
const btnAddNote = document.getElementById("btnAddNote");

const imgFile = document.getElementById("imgFile");
const btnAddImage = document.getElementById("btnAddImage");

const btnClear = document.getElementById("btnClear");
const toast = document.getElementById("toast");

// Notebook DOM refs
const btnNotebook = document.getElementById("btnNotebook");
const notebookOverlay = document.getElementById("notebookOverlay");
const btnCloseNotebook = document.getElementById("btnCloseNotebook");
const btnNewPage = document.getElementById("btnNewPage");
const btnDeletePage = document.getElementById("btnDeletePage");
const tabs = document.getElementById("tabs");
const pageEditor = document.getElementById("pageEditor");
const saveStatus = document.getElementById("saveStatus");

// =========================
// 4) State
// =========================
let currentUser = null;
let selectedEl = null;
let zCounter = 10;

// Notebook state
let notebookPages = [];     // [{id, title, content, updatedAt}]
let activePageId = null;
let saveTimer = null;


// =========================
// 5) Helpers UI
// =========================
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function requireAuth() {
  if (!currentUser) {
    showToast("Primero inicia sesión.");
    return false;
  }
  return true;
}

function randRot() {
  const deg = (Math.random() * 10 - 5).toFixed(2);
  return `${deg}deg`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function boardRect() {
  return board.getBoundingClientRect();
}

function setSelected(el) {
  if (selectedEl && selectedEl !== el) selectedEl.classList.remove("selected");
  selectedEl = el;
  if (selectedEl) selectedEl.classList.add("selected");
}

function bringToFront(el) {
  zCounter += 1;
  el.style.zIndex = String(zCounter);
}

// =========================
// 6) Firestore paths
// =========================
// users/{uid}/items/{itemId}
function itemsCol(uid) {
  return collection(db, "users", uid, "items");
}
function itemDoc(uid, itemId) {
  return doc(db, "users", uid, "items", itemId);
}
// users/{uid}/notebook/pages/{pageId}
function pagesCol(uid) {
  return collection(db, "users", uid, "notebook", "pages");
}
function pageDoc(uid, pageId) {
  return doc(db, "users", uid, "notebook", "pages", pageId);
}


// =========================
// 7) Create DOM elements
// =========================
function createNoteElement(item) {
  const el = document.createElement("div");
  el.className = `item note ${item.color || "yellow"}`;
  el.dataset.id = item.id;
  el.dataset.type = "note";
  el.style.left = `${item.x}px`;
  el.style.top = `${item.y}px`;
  el.style.zIndex = String(item.z || 10);
  el.style.setProperty("--rot", item.rot || randRot());

  const pin = document.createElement("div");
  pin.className = "pin";

  const content = document.createElement("div");
  content.className = "content";
  content.textContent = item.text || "";

  el.appendChild(pin);
  el.appendChild(content);

  el.addEventListener("dblclick", async () => {
    if (!requireAuth()) return;
    const next = prompt("Editar nota:", content.textContent);
    if (next === null) return;
    content.textContent = next;

    item.text = next;
    await setDoc(itemDoc(currentUser.uid, item.id), item, { merge: true });
  });

  attachDragHandlers(el);
  return el;
}

function createPhotoElement(item) {
  const el = document.createElement("div");
  el.className = "item photo";
  el.dataset.id = item.id;
  el.dataset.type = "photo";
  el.style.left = `${item.x}px`;
  el.style.top = `${item.y}px`;
  el.style.zIndex = String(item.z || 10);
  el.style.setProperty("--rot", item.rot || randRot());

  const pin = document.createElement("div");
  pin.className = "pin";

  const img = document.createElement("img");
  img.alt = "pinned";
  img.src = item.dataUrl || "";

  el.appendChild(pin);
  el.appendChild(img);

  attachDragHandlers(el);
  return el;
}

// =========================
// 8) Drag & drop (mouse)
// =========================
function attachDragHandlers(el) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  el.addEventListener("mousedown", (e) => {
    if (!currentUser) return;
    dragging = true;

    setSelected(el);
    bringToFront(el);

    const r = el.getBoundingClientRect();
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;

    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const br = boardRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const x = clamp(e.clientX - br.left - offsetX, 0, br.width - w);
    const y = clamp(e.clientY - br.top - offsetY, 0, br.height - h);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });

  window.addEventListener("mouseup", async () => {
    if (!dragging) return;
    dragging = false;

    if (!currentUser) return;
    const id = el.dataset.id;

    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const z = parseInt(el.style.zIndex || "10", 10);

    await setDoc(itemDoc(currentUser.uid, id), { x, y, z }, { merge: true });
  });

  el.addEventListener("click", () => {
    if (!currentUser) return;
    setSelected(el);
    bringToFront(el);
  });
}

// =========================
// 9) CRUD items
// =========================
function genId() {
  return crypto.randomUUID();
}

async function addNote() {
  if (!requireAuth()) return;
  const text = noteText.value.trim();
  if (!text) return showToast("Escribe algo para la nota.");

  const br = boardRect();
  const id = genId();
  const item = {
    id,
    type: "note",
    text,
    color: noteColor.value,
    x: Math.round(br.width * 0.15 + Math.random() * 80),
    y: Math.round(br.height * 0.15 + Math.random() * 80),
    z: ++zCounter,
    rot: randRot(),
    createdAt: Date.now()
  };

  await setDoc(itemDoc(currentUser.uid, id), item);
  board.appendChild(createNoteElement(item));
  noteText.value = "";
  showToast("Nota añadida.");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function addImage() {
  if (!requireAuth()) return;

  const file = imgFile.files?.[0];
  if (!file) return showToast("Selecciona una imagen.");

  if (file.size > 2_000_000) {
    return showToast("Imagen muy grande (>2MB). Usa una más pequeña para esta demo.");
  }

  const dataUrl = await fileToDataUrl(file);

  const br = boardRect();
  const id = genId();
  const item = {
    id,
    type: "photo",
    dataUrl,
    x: Math.round(br.width * 0.20 + Math.random() * 100),
    y: Math.round(br.height * 0.20 + Math.random() * 100),
    z: ++zCounter,
    rot: randRot(),
    createdAt: Date.now()
  };

  await setDoc(itemDoc(currentUser.uid, id), item);
  board.appendChild(createPhotoElement(item));
  imgFile.value = "";
  showToast("Imagen añadida.");
}

async function loadBoard() {
  board.innerHTML = "";
  board.appendChild(boardHint);

  if (!currentUser) {
    boardHint.classList.remove("hidden");
    return;
  }

  boardHint.classList.add("hidden");

  const snap = await getDocs(itemsCol(currentUser.uid));
  const items = [];
  snap.forEach((d) => items.push(d.data()));

  items.sort((a, b) => (a.z || 0) - (b.z || 0));

  for (const item of items) {
    zCounter = Math.max(zCounter, item.z || 10);
    if (item.type === "note") board.appendChild(createNoteElement(item));
    if (item.type === "photo") board.appendChild(createPhotoElement(item));
  }

  showToast("Tablero cargado.");
}

async function deleteSelected() {
  if (!requireAuth()) return;
  if (!selectedEl) return;

  const id = selectedEl.dataset.id;
  await deleteDoc(itemDoc(currentUser.uid, id));
  selectedEl.remove();
  selectedEl = null;
  showToast("Elemento eliminado.");
}

async function clearAll() {
  if (!requireAuth()) return;
  const ok = confirm("¿Seguro que quieres borrar TODO tu tablero?");
  if (!ok) return;

  const snap = await getDocs(itemsCol(currentUser.uid));
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await loadBoard();
  showToast("Tablero limpio.");
}
// =========================
// 9.5) Notebook (Modal + Tabs)
// =========================
async function openNotebook() {
  if (!requireAuth()) return;

  notebookOverlay.classList.remove("hidden");
  notebookOverlay.setAttribute("aria-hidden", "false");

  // Asegura que haya páginas cargadas y una activa
  if (!activePageId) {
    try {
      await loadNotebook();
    } catch (e) {
      console.error("LOAD NOTEBOOK ERROR:", e);
      showToast(`Notebook: ${e?.code || e?.message || e}`);
    }
  }

  pageEditor.focus();
}

async function closeNotebook() {
  try {
    // Guarda antes de cerrar (por si no alcanzó el autosave)
    if (currentUser && activePageId) {
      await saveActivePageNow();
    }
  } catch (e) {
    console.error("CLOSE/SAVE NOTEBOOK ERROR:", e);
    showToast(`Save: ${e?.code || e?.message || e}`);
  }

  notebookOverlay.classList.add("hidden");
  notebookOverlay.setAttribute("aria-hidden", "true");
}


function renderTabs() {
  tabs.innerHTML = "";
  for (const p of notebookPages) {
    const t = document.createElement("div");
    t.className = "tab" + (p.id === activePageId ? " active" : "");
    t.textContent = p.title || "Página";
    t.addEventListener("click", () => setActivePage(p.id));
    tabs.appendChild(t);
  }
}

function setActivePage(pageId) {
  activePageId = pageId;
  const page = notebookPages.find(p => p.id === pageId);
  pageEditor.value = page?.content || "";
  renderTabs();
  saveStatus.textContent = "Editando…";
}

async function loadNotebook() {
  notebookPages = [];
  activePageId = null;

  if (!currentUser) return;

  const snap = await getDocs(pagesCol(currentUser.uid));
  snap.forEach(d => notebookPages.push(d.data()));

  notebookPages.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (notebookPages.length === 0) {
    await createNewPage();
    return;
  }

  activePageId = notebookPages[0].id;
  renderTabs();
  setActivePage(activePageId);
}

async function createNewPage() {
  if (!requireAuth()) return;

  try {
    const id = crypto.randomUUID();
    const title = `Página ${notebookPages.length + 1}`;
    const page = {
      id,
      title,
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await setDoc(pageDoc(currentUser.uid, id), page);
    notebookPages.unshift(page);
    setActivePage(id);
    renderTabs();
    showToast("Nueva página creada.");
  } catch (e) {
    console.error("NEW PAGE ERROR:", e);
    showToast(`NewPage: ${e?.code || e?.message || e}`);
  }
}


  await setDoc(pageDoc(currentUser.uid, id), page);
  notebookPages.unshift(page);
  setActivePage(id);
  renderTabs();
  showToast("Nueva página creada.");
}

async function deleteActivePage() {
  if (!requireAuth()) return;
  if (!activePageId) return;

  const ok = confirm("¿Eliminar esta página? No hay undo.");
  if (!ok) return;

  await deleteDoc(pageDoc(currentUser.uid, activePageId));
  notebookPages = notebookPages.filter(p => p.id !== activePageId);

  if (notebookPages.length === 0) {
    await createNewPage();
    return;
  }

  activePageId = notebookPages[0].id;
  setActivePage(activePageId);
  renderTabs();
  showToast("Página eliminada.");
}

async function saveActivePageNow() {
  if (!requireAuth()) return;
  const page = notebookPages.find(p => p.id === activePageId);
  if (!page) return;

  page.content = pageEditor.value;
  page.updatedAt = Date.now();

  await setDoc(pageDoc(currentUser.uid, page.id), page, { merge: true });
  saveStatus.textContent = "Guardado ✅";
}

function scheduleSave() {
  saveStatus.textContent = "Guardando…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveActivePageNow().catch(console.error);
  }, 600);
}


// =========================
// 10) Auth
// =========================
btnLoginGoogle.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("AUTH ERROR:", e);
    const code = e?.code || "";
    const msg = e?.message || "";
    showToast(code ? `Error: ${code}` : `Error: ${msg}`);
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (currentUser) {
    btnLoginGoogle.classList.add("hidden");
    btnLogout.classList.remove("hidden");

    userBadge.classList.remove("hidden");
    userPhoto.src = currentUser.photoURL || "";
    userName.textContent = currentUser.displayName || "Usuario";
    userEmail.textContent = currentUser.email || "";

    await loadBoard();
    await loadNotebook();

  } else {
    btnLoginGoogle.classList.remove("hidden");
    btnLogout.classList.add("hidden");

    userBadge.classList.add("hidden");
    userPhoto.src = "";
    userName.textContent = "";
    userEmail.textContent = "";

    selectedEl = null;
    
    notebookPages = [];
activePageId = null;
if (tabs) tabs.innerHTML = "";
if (pageEditor) pageEditor.value = "";
if (saveStatus) saveStatus.textContent = "—";
if (notebookOverlay) notebookOverlay.classList.add("hidden");

    await loadBoard();
  }
});

// =========================
// 11) UI events
// =========================
btnAddNote.addEventListener("click", addNote);
btnAddImage.addEventListener("click", addImage);
btnClear.addEventListener("click", clearAll);

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete") deleteSelected();
});

board.addEventListener("mousedown", (e) => {
  if (e.target === board) setSelected(null);
});

// Notebook events
btnNotebook.addEventListener("click", openNotebook);
btnCloseNotebook.addEventListener("click", closeNotebook);
btnNewPage.addEventListener("click", createNewPage);
btnDeletePage.addEventListener("click", deleteActivePage);

notebookOverlay.addEventListener("mousedown", (e) => {
  if (e.target === notebookOverlay) closeNotebook();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !notebookOverlay.classList.contains("hidden")) {
    closeNotebook();
  }
});

pageEditor.addEventListener("input", async () => {
  if (!requireAuth()) return;

  if (!activePageId) {
    await createNewPage();
  }
  scheduleSave();
});


