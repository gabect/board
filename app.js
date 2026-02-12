// app.js (ESM) — GitHub Pages + Firebase
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
  writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =========================
// Firebase config
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =========================
// Safe storage
// =========================
function safeGet(key){
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val){
  try { localStorage.setItem(key, val); } catch {}
}

// =========================
// DOM
// =========================
const board = document.getElementById("board");
const boardHint = document.getElementById("boardHint");
const toast = document.getElementById("toast");

const userBadge = document.getElementById("userBadge");
const userPhoto = document.getElementById("userPhoto");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const noteText = document.getElementById("noteText");
const noteColor = document.getElementById("noteColor");
const imgFile = document.getElementById("imgFile");

const lnkAddNote = document.getElementById("lnkAddNote");
const lnkAddImage = document.getElementById("lnkAddImage");
const lnkClear = document.getElementById("lnkClear");

const lnkTheme = document.getElementById("lnkTheme");
const lnkNotebook = document.getElementById("lnkNotebook");
const lnkLoginGoogle = document.getElementById("lnkLoginGoogle");
const lnkLogout = document.getElementById("lnkLogout");

// Modal
const notebookOverlay = document.getElementById("notebookOverlay");
const treeRoot = document.getElementById("treeRoot");
const pageEditor = document.getElementById("pageEditor");
const saveStatus = document.getElementById("saveStatus");
const activeContextLabel = document.getElementById("activeContextLabel");

const lnkNewNotebook = document.getElementById("lnkNewNotebook");
const lnkNewPage = document.getElementById("lnkNewPage");
const lnkDeletePage = document.getElementById("lnkDeletePage");
const lnkCloseNotebook = document.getElementById("lnkCloseNotebook");

// =========================
// State
// =========================
let currentUser = null;
let selectedEl = null;
let zCounter = 10;

let notebooks = [];        // [{id,title,createdAt,updatedAt}]
let pagesByNotebook = {};  // { [nbId]: [{id,title,content,order,createdAt,updatedAt}] }

let activeNotebookId = null;
let activePageId = null;
let saveTimer = null;

// =========================
// Helpers UI
// =========================
function showToast(msg){
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.classList.add("hidden"), 2200);
}

function requireAuth(){
  if(!currentUser){
    showToast("Primero inicia sesión.");
    return false;
  }
  return true;
}

function genId(){ return crypto.randomUUID(); }
function randRot(){ return `${(Math.random()*10-5).toFixed(2)}deg`; }
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
function boardRect(){ return board.getBoundingClientRect(); }

function setSelected(el){
  if(selectedEl && selectedEl !== el) selectedEl.classList.remove("selected");
  selectedEl = el;
  if(selectedEl) selectedEl.classList.add("selected");
}
function bringToFront(el){ zCounter += 1; el.style.zIndex = String(zCounter); }

function lsKey(name){
  const uid = currentUser?.uid || "anon";
  return `board.${uid}.${name}`;
}

function setContextLabel(){
  if(!activeContextLabel) return;
  const nb = notebooks.find(n=>n.id===activeNotebookId);
  const pages = pagesByNotebook[activeNotebookId] || [];
  const pg = pages.find(p=>p.id===activePageId);
  activeContextLabel.textContent = `${nb?.title || "—"} / ${pg?.title || "—"}`;
}

// =========================
// Firestore paths
// =========================
function itemsCol(uid){ return collection(db, "users", uid, "items"); }
function itemDoc(uid, itemId){ return doc(db, "users", uid, "items", itemId); }

function notebooksCol(uid){ return collection(db, "users", uid, "notebooks"); }
function notebookDoc(uid, notebookId){ return doc(db, "users", uid, "notebooks", notebookId); }

function pagesCol(uid, notebookId){ return collection(db, "users", uid, "notebooks", notebookId, "pages"); }
function pageDoc(uid, notebookId, pageId){ return doc(db, "users", uid, "notebooks", notebookId, "pages", pageId); }

// =========================
// Theme (day/night/matrix)
// =========================
const THEMES = ["day", "night", "matrix"];
function getTheme(){ return safeGet("ui.theme") || "night"; }
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  safeSet("ui.theme", t);
  if(lnkTheme) lnkTheme.textContent = `Tema: ${t}`;
}
function cycleTheme(e){
  e?.preventDefault();
  const cur = getTheme();
  const i = THEMES.indexOf(cur);
  const next = THEMES[(i+1) % THEMES.length];
  setTheme(next);
}
setTheme(getTheme());
lnkTheme?.addEventListener("click", cycleTheme);

// =========================
// Board DOM elements
// =========================
function createNoteElement(item){
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

  el.append(pin, content);

  el.addEventListener("dblclick", async ()=>{
    if(!requireAuth()) return;
    const next = prompt("Editar nota:", content.textContent);
    if(next === null) return;
    content.textContent = next;
    await setDoc(itemDoc(currentUser.uid, item.id), { text: next }, { merge:true });
  });

  attachDragHandlers(el);
  return el;
}

function createPhotoElement(item){
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

  el.append(pin, img);

  attachDragHandlers(el);
  return el;
}

// Drag handlers
function attachDragHandlers(el){
  let dragging=false, offsetX=0, offsetY=0;

  el.addEventListener("mousedown", (e)=>{
    if(!currentUser) return;
    dragging=true;
    setSelected(el);
    bringToFront(el);

    const r = el.getBoundingClientRect();
    offsetX = e.clientX - r.left;
    offsetY = e.clientY - r.top;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e)=>{
    if(!dragging) return;
    const br = boardRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const x = clamp(e.clientX - br.left - offsetX, 0, br.width - w);
    const y = clamp(e.clientY - br.top - offsetY, 0, br.height - h);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });

  window.addEventListener("mouseup", async ()=>{
    if(!dragging) return;
    dragging=false;
    if(!currentUser) return;

    const id = el.dataset.id;
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const z = parseInt(el.style.zIndex || "10", 10);
    await setDoc(itemDoc(currentUser.uid, id), { x,y,z }, { merge:true });
  });

  el.addEventListener("click", ()=>{
    if(!currentUser) return;
    setSelected(el);
    bringToFront(el);
  });
}

// =========================
// Board CRUD
// =========================
async function addNote(e){
  e?.preventDefault();
  if(!requireAuth()) return;

  const text = noteText?.value?.trim() || "";
  if(!text) return showToast("Escribe algo para la nota.");

  const br = boardRect();
  const id = genId();

  const item = {
    id, type:"note",
    text,
    color: noteColor?.value || "yellow",
    x: Math.round(br.width * 0.15 + Math.random()*80),
    y: Math.round(br.height * 0.15 + Math.random()*80),
    z: ++zCounter,
    rot: randRot(),
    createdAt: Date.now()
  };

  await setDoc(itemDoc(currentUser.uid, id), item);
  board.appendChild(createNoteElement(item));
  if(noteText) noteText.value = "";
  showToast("Nota añadida.");
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function addImage(e){
  e?.preventDefault();
  if(!requireAuth()) return;

  const file = imgFile?.files?.[0];
  if(!file) return showToast("Selecciona una imagen.");
  if(file.size > 2_000_000) return showToast("Imagen muy grande (>2MB).");

  const dataUrl = await fileToDataUrl(file);
  const br = boardRect();
  const id = genId();

  const item = {
    id, type:"photo",
    dataUrl,
    x: Math.round(br.width * 0.20 + Math.random()*100),
    y: Math.round(br.height * 0.20 + Math.random()*100),
    z: ++zCounter,
    rot: randRot(),
    createdAt: Date.now()
  };

  await setDoc(itemDoc(currentUser.uid, id), item);
  board.appendChild(createPhotoElement(item));
  if(imgFile) imgFile.value = "";
  showToast("Imagen añadida.");
}

async function loadBoard(){
  if(!board) return;
  board.innerHTML = "";
  if(boardHint) board.appendChild(boardHint);

  if(!currentUser){
    boardHint?.classList.remove("hidden");
    return;
  }
  boardHint?.classList.add("hidden");

  const snap = await getDocs(itemsCol(currentUser.uid));
  const items = [];
  snap.forEach(d=>items.push(d.data()));
  items.sort((a,b)=>(a.z||0)-(b.z||0));

  for(const item of items){
    zCounter = Math.max(zCounter, item.z || 10);
    if(item.type==="note") board.appendChild(createNoteElement(item));
    if(item.type==="photo") board.appendChild(createPhotoElement(item));
  }
}

async function deleteSelected(){
  if(!requireAuth()) return;
  if(!selectedEl) return;
  const id = selectedEl.dataset.id;
  await deleteDoc(itemDoc(currentUser.uid, id));
  selectedEl.remove();
  selectedEl=null;
  showToast("Elemento eliminado.");
}

async function clearAll(e){
  e?.preventDefault();
  if(!requireAuth()) return;
  if(!confirm("¿Seguro que quieres borrar TODO tu tablero?")) return;

  const snap = await getDocs(itemsCol(currentUser.uid));
  const batch = writeBatch(db);
  snap.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  await loadBoard();
  showToast("Tablero limpio.");
}

// =========================
// Notebook: collapse persistence
// =========================
function collapseKey(nbId){
  return lsKey(`nbCollapsed.${nbId}`);
}
function isCollapsed(nbId){
  return safeGet(collapseKey(nbId)) === "1";
}
function setCollapsed(nbId, collapsed){
  safeSet(collapseKey(nbId), collapsed ? "1" : "0");
}
function collapseAllExcept(activeId){
  for(const nb of notebooks){
    setCollapsed(nb.id, nb.id !== activeId);
  }
}

// =========================
// Load notebooks + pages
// =========================
async function loadNotebooksAndPages(){
  notebooks = [];
  pagesByNotebook = {};
  activeNotebookId = null;
  activePageId = null;

  if(!currentUser) return;

  const nbSnap = await getDocs(notebooksCol(currentUser.uid));
  nbSnap.forEach(d=>notebooks.push(d.data()));
  notebooks.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));

  if(notebooks.length === 0){
    await createNotebook("Mi Libreta");
    return;
  }

  const preferred = safeGet(lsKey("activeNotebookId"));
  const exists = preferred && notebooks.some(n=>n.id===preferred);
  activeNotebookId = exists ? preferred : notebooks[0].id;
  safeSet(lsKey("activeNotebookId"), activeNotebookId);

  // Al abrir, colapsa todo excepto la activa (persistente)
  collapseAllExcept(activeNotebookId);

  // Load pages for all notebooks (simple + reliable)
  for(const nb of notebooks){
    const pSnap = await getDocs(pagesCol(currentUser.uid, nb.id));
    const pages = [];
    pSnap.forEach(d=>pages.push(d.data()));

    // Orden: primero order (si existe), luego updatedAt
    pages.sort((a,b)=>{
      const ao = (typeof a.order === "number") ? a.order : 999999;
      const bo = (typeof b.order === "number") ? b.order : 999999;
      if(ao !== bo) return ao - bo;
      return (b.updatedAt||0) - (a.updatedAt||0);
    });

    pagesByNotebook[nb.id] = pages;

    // Si libreta sin páginas, crea una
    if(pages.length === 0){
      await createPage(nb.id, "Página 1");
    }
  }

  // Set active page (first of active notebook)
  const activePages = pagesByNotebook[activeNotebookId] || [];
  activePageId = activePages[0]?.id || null;

  // Fill editor
  const pg = activePages.find(p=>p.id===activePageId);
  if(pageEditor) pageEditor.value = pg?.content || "";

  setContextLabel();
  renderTree();
}

// =========================
// Render tree (notebooks + nested pages)
// =========================
function renderTree(){
  if(!treeRoot) return;
  treeRoot.innerHTML = "";

  for(const nb of notebooks){
    const nbRow = document.createElement("li");

    const row = document.createElement("div");
    const collapsed = isCollapsed(nb.id);
    const expanded = !collapsed;

    row.className = "treeRow" + (nb.id===activeNotebookId ? " active" : "") + (expanded ? " expanded" : "");
    row.dataset.nb = nb.id;

    const toggle = document.createElement("span");
    toggle.className = "treeToggle";
    toggle.textContent = expanded ? "▼" : "▶";

    const text = document.createElement("span");
    text.className = "treeText";
    text.textContent = nb.title || "Libreta";

    row.append(toggle, text);

    // Click notebook: activate + collapse others (persistente)
    row.addEventListener("click", async ()=>{
      if(!currentUser) return;
      await setActiveNotebook(nb.id);
    });

    // Double click rename notebook
    row.addEventListener("dblclick", async (e)=>{
      e.preventDefault();
      e.stopPropagation();
      await renameNotebook(nb.id);
    });

    nbRow.appendChild(row);

    // children pages
    const ul = document.createElement("ul");
    ul.className = "treeChildren";

    const pages = pagesByNotebook[nb.id] || [];
    pages.forEach((p, idx)=>{
      const li = document.createElement("li");

      const pr = document.createElement("div");
      pr.className = "pageRow" + (p.id===activePageId ? " active" : "");
      pr.draggable = (nb.id === activeNotebookId); // solo reorder en activa
      pr.dataset.page = p.id;
      pr.dataset.nb = nb.id;

      const drag = document.createElement("span");
      drag.className = "dragHint";
      drag.textContent = (nb.id === activeNotebookId) ? "⋮" : "•";

      const label = document.createElement("span");
      label.className = "treeText";
      label.textContent = p.title || "Página";

      pr.append(drag, label);

      // Click page
      pr.addEventListener("click", async (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(nb.id !== activeNotebookId){
          await setActiveNotebook(nb.id);
        }
        await saveActivePageNow();
        setActivePage(p.id);
      });

      // Double click rename page
      pr.addEventListener("dblclick", async (e)=>{
        e.preventDefault();
        e.stopPropagation();
        await renamePage(nb.id, p.id);
      });

      // Drag & drop reorder (only active notebook)
      if(nb.id === activeNotebookId){
        pr.addEventListener("dragstart", (e)=>{
          e.dataTransfer.setData("text/plain", String(idx));
          e.dataTransfer.effectAllowed = "move";
        });

        pr.addEventListener("dragover", (e)=>{
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });

        pr.addEventListener("drop", async (e)=>{
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
          const to = idx;
          if(Number.isNaN(from) || from === to) return;
          await reorderPagesActiveNotebook(from, to);
        });
      }

      li.appendChild(pr);
      ul.appendChild(li);
    });

    nbRow.appendChild(ul);
    treeRoot.appendChild(nbRow);
  }

  setContextLabel();
}

// =========================
// Active notebook/page
// =========================
async function setActiveNotebook(nbId){
  if(!currentUser) return;
  if(nbId === activeNotebookId){
    // Toggle collapse on same notebook
    const nowCollapsed = !isCollapsed(nbId);
    setCollapsed(nbId, nowCollapsed);
    renderTree();
    return;
  }

  clearTimeout(saveTimer);
  await saveActivePageNow();

  activeNotebookId = nbId;
  safeSet(lsKey("activeNotebookId"), activeNotebookId);

  // Colapsar todas menos la activa (persistente)
  collapseAllExcept(activeNotebookId);

  // Set active page = first
  const pages = pagesByNotebook[activeNotebookId] || [];
  activePageId = pages[0]?.id || null;

  const pg = pages.find(p=>p.id===activePageId);
  if(pageEditor) pageEditor.value = pg?.content || "";

  if(saveStatus) saveStatus.textContent = "—";
  renderTree();
}

function setActivePage(pageId){
  activePageId = pageId;
  const pages = pagesByNotebook[activeNotebookId] || [];
  const pg = pages.find(p=>p.id===activePageId);
  if(pageEditor) pageEditor.value = pg?.content || "";
  if(saveStatus) saveStatus.textContent = "Editando…";
  renderTree();
}

// =========================
// Notebook actions
// =========================
async function createNotebook(defaultTitle=null){
  if(!requireAuth()) return;

  const title = (defaultTitle ?? prompt("Nombre de la libreta:", `Libreta ${notebooks.length+1}`))?.trim();
  if(!title) return;

  const id = genId();
  const nb = { id, title, createdAt: Date.now(), updatedAt: Date.now() };

  await setDoc(notebookDoc(currentUser.uid, id), nb);
  notebooks.unshift(nb);
  pagesByNotebook[id] = [];

  await createPage(id, "Página 1");

  await setActiveNotebook(id);
  showToast("Libreta creada ✅");
}

async function renameNotebook(nbId){
  if(!requireAuth()) return;
  const nb = notebooks.find(n=>n.id===nbId);
  if(!nb) return;

  const next = prompt("Renombrar libreta:", nb.title || "Libreta");
  if(next === null) return;
  const title = next.trim();
  if(!title) return;

  nb.title = title;
  nb.updatedAt = Date.now();

  await updateDoc(notebookDoc(currentUser.uid, nb.id), { title, updatedAt: nb.updatedAt });
  renderTree();
  setContextLabel();
  showToast("Renombrada ✅");
}

async function createPage(nbId, defaultTitle=null){
  if(!requireAuth()) return;
  const pages = pagesByNotebook[nbId] || [];
  const id = genId();

  const title = defaultTitle ?? `Página ${pages.length + 1}`;
  const page = {
    id,
    title,
    content: "",
    order: pages.length, // order inicial
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await setDoc(pageDoc(currentUser.uid, nbId, id), page);
  pagesByNotebook[nbId] = [...pages, page];

  // keep sorted by order
  pagesByNotebook[nbId].sort((a,b)=>(a.order??999999)-(b.order??999999));

  // If this notebook is active, open the new page
  if(nbId === activeNotebookId){
    setActivePage(id);
  }
}

async function renamePage(nbId, pageId){
  if(!requireAuth()) return;

  const pages = pagesByNotebook[nbId] || [];
  const pg = pages.find(p=>p.id===pageId);
  if(!pg) return;

  const next = prompt("Renombrar página:", pg.title || "Página");
  if(next === null) return;
  const title = next.trim();
  if(!title) return;

  pg.title = title;
  pg.updatedAt = Date.now();

  await updateDoc(pageDoc(currentUser.uid, nbId, pageId), { title, updatedAt: pg.updatedAt });
  renderTree();
  setContextLabel();
  showToast("Página renombrada ✅");
}

async function deleteActivePage(e){
  e?.preventDefault();
  if(!requireAuth()) return;
  if(!activeNotebookId || !activePageId) return;

  if(!confirm("¿Eliminar esta página? No hay undo.")) return;

  await deleteDoc(pageDoc(currentUser.uid, activeNotebookId, activePageId));
  const pages = pagesByNotebook[activeNotebookId] || [];
  pagesByNotebook[activeNotebookId] = pages.filter(p=>p.id !== activePageId);

  // If none, create one
  if(pagesByNotebook[activeNotebookId].length === 0){
    await createPage(activeNotebookId, "Página 1");
  }

  // Activate first
  const first = pagesByNotebook[activeNotebookId][0];
  activePageId = first?.id || null;
  if(pageEditor) pageEditor.value = first?.content || "";

  renderTree();
  setContextLabel();
  showToast("Página eliminada ✅");
}

// Reorder pages (active notebook) + persist order to Firestore
async function reorderPagesActiveNotebook(fromIndex, toIndex){
  if(!requireAuth()) return;
  const nbId = activeNotebookId;
  const pages = [...(pagesByNotebook[nbId] || [])];
  if(fromIndex < 0 || toIndex < 0 || fromIndex >= pages.length || toIndex >= pages.length) return;

  const [moved] = pages.splice(fromIndex, 1);
  pages.splice(toIndex, 0, moved);

  // reassign order sequentially
  pages.forEach((p, i)=>{ p.order = i; });

  pagesByNotebook[nbId] = pages;

  // Persist in batch
  const batch = writeBatch(db);
  for(const p of pages){
    batch.update(pageDoc(currentUser.uid, nbId, p.id), { order: p.order, updatedAt: Date.now() });
  }
  await batch.commit();

  renderTree();
  showToast("Orden guardado ✅");
}

// =========================
// Autosave page content
// =========================
async function saveActivePageNow(){
  if(!currentUser || !activeNotebookId || !activePageId) return;
  const pages = pagesByNotebook[activeNotebookId] || [];
  const pg = pages.find(p=>p.id===activePageId);
  if(!pg) return;

  pg.content = pageEditor?.value ?? "";
  pg.updatedAt = Date.now();

  await setDoc(pageDoc(currentUser.uid, activeNotebookId, activePageId), pg, { merge:true });
  if(saveStatus) saveStatus.textContent = "Guardado ✅";
  setContextLabel();
}

function scheduleSave(){
  if(saveStatus) saveStatus.textContent = "Guardando…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>saveActivePageNow().catch(console.error), 600);
}

// =========================
// Modal open/close
// =========================
async function openNotebook(e){
  e?.preventDefault();
  if(!requireAuth()) return;

  notebookOverlay?.classList.remove("hidden");
  notebookOverlay?.setAttribute("aria-hidden", "false");

  try{
    await loadNotebooksAndPages();
    renderTree();
  }catch(err){
    console.error(err);
    showToast(err?.code || err?.message || String(err));
  }

  pageEditor?.focus();
}

async function closeNotebook(e){
  e?.preventDefault();
  try{
    clearTimeout(saveTimer);
    await saveActivePageNow();
  }catch(err){
    console.error(err);
  }
  notebookOverlay?.classList.add("hidden");
  notebookOverlay?.setAttribute("aria-hidden", "true");
}

// =========================
// Auth
// =========================
async function loginGoogle(e){
  e?.preventDefault();
  try{
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }catch(err){
    console.error(err);
    showToast(err?.code || err?.message || "Error de auth");
  }
}

async function logout(e){
  e?.preventDefault();
  try{
    await signOut(auth);
  }catch(err){
    console.error(err);
  }
}

onAuthStateChanged(auth, async (user)=>{
  currentUser = user || null;

  if(currentUser){
    lnkLoginGoogle?.classList.add("hidden");
    lnkLogout?.classList.remove("hidden");
    userBadge?.classList.remove("hidden");
    if(userPhoto) userPhoto.src = currentUser.photoURL || "";
    if(userName) userName.textContent = currentUser.displayName || "Usuario";
    if(userEmail) userEmail.textContent = currentUser.email || "";

    await loadBoard();
    showToast("Sesión iniciada ✅");
  }else{
    lnkLoginGoogle?.classList.remove("hidden");
    lnkLogout?.classList.add("hidden");
    userBadge?.classList.add("hidden");

    if(userPhoto) userPhoto.src = "";
    if(userName) userName.textContent = "";
    if(userEmail) userEmail.textContent = "";

    selectedEl = null;
    notebooks = [];
    pagesByNotebook = {};
    activeNotebookId = null;
    activePageId = null;

    notebookOverlay?.classList.add("hidden");
    setContextLabel();
    await loadBoard();
  }
});

// =========================
// Events (links only)
// =========================
lnkLoginGoogle?.addEventListener("click", loginGoogle);
lnkLogout?.addEventListener("click", logout);

lnkAddNote?.addEventListener("click", addNote);
lnkAddImage?.addEventListener("click", addImage);
lnkClear?.addEventListener("click", clearAll);

lnkNotebook?.addEventListener("click", openNotebook);
lnkCloseNotebook?.addEventListener("click", closeNotebook);

lnkNewNotebook?.addEventListener("click", async (e)=>{
  e.preventDefault();
  await createNotebook();
  renderTree();
});

lnkNewPage?.addEventListener("click", async (e)=>{
  e.preventDefault();
  if(!requireAuth()) return;
  if(!activeNotebookId) return;
  await createPage(activeNotebookId);
  renderTree();
});

lnkDeletePage?.addEventListener("click", deleteActivePage);

// Close modal clicking overlay
notebookOverlay?.addEventListener("mousedown", (e)=>{
  if(e.target === notebookOverlay) closeNotebook(e);
});

// Keyboard
window.addEventListener("keydown", (e)=>{
  if(e.key === "Delete") deleteSelected();
  if(e.key === "Escape" && notebookOverlay && !notebookOverlay.classList.contains("hidden")){
    closeNotebook(e);
  }
});

// Board deselect
board?.addEventListener("mousedown", (e)=>{
  if(e.target === board) setSelected(null);
});

// Autosave typing
pageEditor?.addEventListener("input", ()=>{
  if(!currentUser) return;
  if(!activeNotebookId || !activePageId) return;
  scheduleSave();
});


// =========================
// Focus Tools: Clock/Timer/Alarm/Pomodoro/Music
// =========================
const $ = (id) => document.getElementById(id);

const clockTime = $("clockTime");
const clockSec  = $("clockSec");

const modeTimer = $("modeTimer");
const modeAlarm = $("modeAlarm");
const modePomo  = $("modePomo");
const modeMusic = $("modeMusic");
const focusPanel = $("focusPanel");

// ---- Clock ----
function pad2(n){ return String(n).padStart(2,"0"); }
function tickClock(){
  const d = new Date();
  clockTime.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  clockSec.textContent  = pad2(d.getSeconds());
}
setInterval(tickClock, 250);
tickClock();

// ---- Simple sound (no deps) ----
let audioCtx = null;
function beep(ms=200, freq=880){
  try{
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.value = 0.05;
    o.start();
    setTimeout(()=>{ o.stop(); }, ms);
  }catch{}
}

// ---- Notifications helper ----
async function ensureNotify(){
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}
function notify(title, body){
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

// ---- Mode UI ----
const MODES = ["timer","alarm","pomo","music"];
let activeMode = localStorage.getItem("focus.mode") || "timer";

function setActiveMode(m){
  activeMode = m;
  localStorage.setItem("focus.mode", m);

  [modeTimer, modeAlarm, modePomo, modeMusic].forEach(a => a?.classList.remove("active"));
  if (m==="timer") modeTimer?.classList.add("active");
  if (m==="alarm") modeAlarm?.classList.add("active");
  if (m==="pomo")  modePomo?.classList.add("active");
  if (m==="music") modeMusic?.classList.add("active");

  renderPanel();
}

modeTimer?.addEventListener("click", (e)=>{ e.preventDefault(); setActiveMode("timer"); });
modeAlarm?.addEventListener("click", (e)=>{ e.preventDefault(); setActiveMode("alarm"); });
modePomo?.addEventListener("click",  (e)=>{ e.preventDefault(); setActiveMode("pomo"); });
modeMusic?.addEventListener("click", (e)=>{ e.preventDefault(); setActiveMode("music"); });

// ---- Timer ----
let timerT = null;
let timerEnd = null;

function startTimer(minutes){
  clearInterval(timerT);
  timerEnd = Date.now() + minutes*60*1000;
  timerT = setInterval(()=>{
    const left = Math.max(0, timerEnd - Date.now());
    updateTimerPill(left);
    if (left <= 0){
      clearInterval(timerT);
      beep(350, 880);
      ensureNotify().then(()=> notify("Timer terminado", `Listo: ${minutes} min`));
    }
  }, 250);
}

function stopTimer(){
  clearInterval(timerT);
  timerT = null;
  timerEnd = null;
  updateTimerPill(null);
}

function updateTimerPill(msLeft){
  const pill = $("timerPill");
  if (!pill) return;
  if (msLeft == null){ pill.textContent = "—"; return; }
  const s = Math.ceil(msLeft/1000);
  const mm = Math.floor(s/60);
  const ss = s%60;
  pill.textContent = `${pad2(mm)}:${pad2(ss)}`;
}

// ---- Alarm (simple: today/time) ----
let alarmT = null;
let alarmAt = null;

function setAlarm(hhmm){
  clearInterval(alarmT);
  const [h,m] = hhmm.split(":").map(Number);
  const now = new Date();
  const at = new Date();
  at.setHours(h, m, 0, 0);
  if (at <= now) at.setDate(at.getDate()+1); // mañana
  alarmAt = at.getTime();

  alarmT = setInterval(()=>{
    const left = alarmAt - Date.now();
    const pill = $("alarmPill");
    if (pill){
      const s = Math.max(0, Math.ceil(left/1000));
      const hh = Math.floor(s/3600);
      const mm = Math.floor((s%3600)/60);
      pill.textContent = `${hh}h ${mm}m`;
    }
    if (left <= 0){
      clearInterval(alarmT);
      beep(600, 660);
      ensureNotify().then(()=> notify("⏰ Alarma", `Hora: ${hhmm}`));
    }
  }, 500);
}

function clearAlarm(){
  clearInterval(alarmT);
  alarmT = null;
  alarmAt = null;
  const pill = $("alarmPill");
  if (pill) pill.textContent = "—";
}

// ---- Pomodoro ----
let pomoT = null;
let pomoEnd = null;
let pomoState = localStorage.getItem("pomo.state") || "work"; // work|break
let pomoWork = Number(localStorage.getItem("pomo.work") || 25);
let pomoBreak = Number(localStorage.getItem("pomo.break") || 5);

function startPomo(){
  clearInterval(pomoT);
  const mins = pomoState === "work" ? pomoWork : pomoBreak;
  pomoEnd = Date.now() + mins*60*1000;

  pomoT = setInterval(()=>{
    const left = Math.max(0, pomoEnd - Date.now());
    updatePomoPill(left);
    if (left <= 0){
      clearInterval(pomoT);
      beep(450, pomoState==="work" ? 520 : 820);
      ensureNotify().then(()=> notify("Pomodoro", pomoState==="work" ? "Descanso" : "A trabajar"));

      // alterna estado y reinicia si quieres auto-run
      pomoState = (pomoState === "work") ? "break" : "work";
      localStorage.setItem("pomo.state", pomoState);
      renderPanel();
    }
  }, 250);
}

function stopPomo(){
  clearInterval(pomoT);
  pomoT = null;
  pomoEnd = null;
  updatePomoPill(null);
}

function updatePomoPill(msLeft){
  const pill = $("pomoPill");
  if (!pill) return;
  if (msLeft == null){ pill.textContent = "—"; return; }
  const s = Math.ceil(msLeft/1000);
  const mm = Math.floor(s/60);
  const ss = s%60;
  pill.textContent = `${pad2(mm)}:${pad2(ss)}`;
}

// ---- Music (focus audio): simple noise generator ----
let noiseNode = null;
function startNoise(type="brown"){
  stopNoise();
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  const bufferSize = 2 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i=0; i<bufferSize; i++){
    const white = Math.random()*2 - 1;
    if (type === "brown"){
      lastOut = (lastOut + 0.02*white) / 1.02;
      output[i] = lastOut * 3.5;
    } else {
      output[i] = white * 0.15;
    }
  }

  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const gain = audioCtx.createGain();
  gain.gain.value = 0.06;

  src.connect(gain);
  gain.connect(audioCtx.destination);

  src.start();
  noiseNode = { src, gain };
}

function stopNoise(){
  try{
    if (noiseNode?.src) noiseNode.src.stop();
  }catch{}
  noiseNode = null;
}

// ---- Render ----
function renderPanel(){
  if (!focusPanel) return;

  if (activeMode === "timer"){
    focusPanel.innerHTML = `
      <span class="pill" title="Tiempo restante" id="timerPill">—</span>
      <input id="timerMin" type="number" min="1" max="240" value="25" aria-label="Minutos" />
      <a class="action" href="#" id="timerStart">Iniciar</a>
      <a class="action" href="#" id="timerStop">Parar</a>
    `;
    $("timerStart")?.addEventListener("click",(e)=>{ e.preventDefault(); startTimer(Number($("timerMin").value||25)); });
    $("timerStop")?.addEventListener("click",(e)=>{ e.preventDefault(); stopTimer(); });
    updateTimerPill(timerEnd ? Math.max(0, timerEnd-Date.now()) : null);
    return;
  }

  if (activeMode === "alarm"){
    focusPanel.innerHTML = `
      <span class="pill" title="Falta" id="alarmPill">—</span>
      <input id="alarmTime" type="time" aria-label="Hora alarma" />
      <a class="action" href="#" id="alarmSet">Programar</a>
      <a class="action" href="#" id="alarmClear">Quitar</a>
    `;
    $("alarmSet")?.addEventListener("click", async (e)=>{
      e.preventDefault();
      await ensureNotify();
      const t = $("alarmTime").value;
      if (!t) return;
      setAlarm(t);
    });
    $("alarmClear")?.addEventListener("click",(e)=>{ e.preventDefault(); clearAlarm(); });
    return;
  }

  if (activeMode === "pomo"){
    focusPanel.innerHTML = `
      <span class="pill" id="pomoPill">—</span>
      <span class="pill">${pomoState === "work" ? "Trabajo" : "Descanso"}</span>
      <input id="pomoWork" type="number" min="10" max="90" value="${pomoWork}" aria-label="Min trabajo" />
      <input id="pomoBreak" type="number" min="3" max="30" value="${pomoBreak}" aria-label="Min descanso" />
      <a class="action" href="#" id="pomoStart">Iniciar</a>
      <a class="action" href="#" id="pomoStop">Parar</a>
    `;
    $("pomoWork")?.addEventListener("change", (e)=>{
      pomoWork = Number(e.target.value||25);
      localStorage.setItem("pomo.work", String(pomoWork));
    });
    $("pomoBreak")?.addEventListener("change", (e)=>{
      pomoBreak = Number(e.target.value||5);
      localStorage.setItem("pomo.break", String(pomoBreak));
    });
    $("pomoStart")?.addEventListener("click",(e)=>{ e.preventDefault(); startPomo(); });
    $("pomoStop")?.addEventListener("click",(e)=>{ e.preventDefault(); stopPomo(); });

    updatePomoPill(pomoEnd ? Math.max(0, pomoEnd-Date.now()) : null);
    return;
  }

  if (activeMode === "music"){
    focusPanel.innerHTML = `
      <select id="noiseType" aria-label="Tipo">
        <option value="brown">Brown noise</option>
        <option value="white">White noise</option>
      </select>
      <a class="action" href="#" id="noiseOn">On</a>
      <a class="action" href="#" id="noiseOff">Off</a>
      <span class="pill" style="opacity:.75">Sin YouTube, sin distracciones.</span>
    `;
    $("noiseOn")?.addEventListener("click",(e)=>{ e.preventDefault(); startNoise($("noiseType").value); });
    $("noiseOff")?.addEventListener("click",(e)=>{ e.preventDefault(); stopNoise(); });
    return;
  }
}

setActiveMode(activeMode);
