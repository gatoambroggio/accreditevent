import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Normalización global a MAYÚSCULAS para todo el sistema.
// El CSS text-transform solo cambia lo visual; esto asegura que el VALOR
// guardado también quede en mayúsculas (todo lo que se registre).
const UPPER_TYPES = new Set(['text', 'tel', 'search', 'url', '']);
let nativeInputSetter = null;
let nativeTextareaSetter = null;
try {
  nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
} catch {}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el) return;
  const tag = el.tagName;
  const isInput = tag === 'INPUT';
  const isTextarea = tag === 'TEXTAREA';
  if (!isInput && !isTextarea) return;
  const type = (el.type || '').toLowerCase();
  const shouldUpper = isTextarea || UPPER_TYPES.has(type);
  if (!shouldUpper) return;
  const upper = (el.value || '').toUpperCase();
  if (upper === el.value) return; // ya está en mayúsculas (evita bucle)
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const setter = isTextarea ? nativeTextareaSetter : nativeInputSetter;
  if (setter) {
    setter.call(el, upper);
  } else {
    el.value = upper;
  }
  try { el.setSelectionRange(start, end); } catch {}
  // Re-notifica a React (controlled inputs) para que el state quede en mayúsculas
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)