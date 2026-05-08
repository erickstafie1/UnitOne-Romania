// src/components/Editor.jsx
// GrapesJS editor cu toate blocurile COD + placeholder-e unitone-releasit-btn
// Fix: blocurile definite direct în componentă, fără import EditorHelpers.js

import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

// ─── Blocuri predefinite ──────────────────────────────────────────────────────

const BLOCKS = [
  {
    id: "hero-section",
    label: "🎯 Hero Section",
    category: "Secțiuni",
    content: `
      <section style="background:#1a1a2e;color:#fff;padding:60px 20px;text-align:center;">
        <h1 style="font-size:2.5rem;margin-bottom:16px;font-weight:800;">Titlu Produs</h1>
        <p style="font-size:1.2rem;opacity:0.85;margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto;">
          Descriere scurtă și convingătoare despre produs.
        </p>
        <div class="unitone-releasit-btn" style="display:inline-block;min-width:200px;min-height:50px;"></div>
      </section>`,
  },
  {
    id: "releasit-button",
    label: "🛒 Buton COD Releasit",
    category: "Butoane",
    content: `
      <div style="text-align:center;padding:20px;">
        <div class="unitone-releasit-btn"
             style="display:inline-block;min-width:220px;min-height:54px;border:2px dashed #e74c3c;border-radius:8px;padding:4px;"
             title="Butonul Releasit va apărea aici">
          <span style="color:#e74c3c;font-size:12px;pointer-events:none;">Buton COD — apare automat</span>
        </div>
      </div>`,
  },
  {
    id: "product-images",
    label: "🖼️ Galerie Imagini",
    category: "Media",
    content: `
      <section style="padding:40px 20px;background:#fff;">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:800px;margin:0 auto;">
          <img src="https://placehold.co/400x400" style="width:100%;border-radius:12px;object-fit:cover;" alt="Produs 1"/>
          <img src="https://placehold.co/400x400" style="width:100%;border-radius:12px;object-fit:cover;" alt="Produs 2"/>
          <img src="https://placehold.co/400x400" style="width:100%;border-radius:12px;object-fit:cover;" alt="Produs 3"/>
          <img src="https://placehold.co/400x400" style="width:100%;border-radius:12px;object-fit:cover;" alt="Produs 4"/>
        </div>
      </section>`,
  },
  {
    id: "benefits-section",
    label: "✅ Beneficii",
    category: "Secțiuni",
    content: `
      <section style="padding:50px 20px;background:#f8f9fa;">
        <h2 style="text-align:center;font-size:1.8rem;margin-bottom:32px;color:#1a1a2e;">De ce să alegi acest produs?</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:900px;margin:0 auto;">
          <div style="text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <div style="font-size:2rem;margin-bottom:12px;">⚡</div>
            <h3 style="margin-bottom:8px;color:#1a1a2e;">Livrare Rapidă</h3>
            <p style="color:#666;font-size:0.95rem;">Primeşti produsul în 7-14 zile lucrătoare.</p>
          </div>
          <div style="text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <div style="font-size:2rem;margin-bottom:12px;">🔒</div>
            <h3 style="margin-bottom:8px;color:#1a1a2e;">Plată la Livrare</h3>
            <p style="color:#666;font-size:0.95rem;">Plăteşti doar când primeşti coletul.</p>
          </div>
          <div style="text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <div style="font-size:2rem;margin-bottom:12px;">↩️</div>
            <h3 style="margin-bottom:8px;color:#1a1a2e;">Retur Gratuit</h3>
            <p style="color:#666;font-size:0.95rem;">30 de zile garanție de returnare.</p>
          </div>
        </div>
      </section>`,
  },
  {
    id: "testimonials",
    label: "⭐ Testimoniale",
    category: "Secțiuni",
    content: `
      <section style="padding:50px 20px;background:#fff;">
        <h2 style="text-align:center;font-size:1.8rem;margin-bottom:32px;color:#1a1a2e;">Ce spun clienții noștri</h2>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;max-width:800px;margin:0 auto;">
          <div style="padding:24px;background:#f8f9fa;border-radius:12px;border-left:4px solid #e74c3c;">
            <div style="color:#f39c12;margin-bottom:8px;">★★★★★</div>
            <p style="color:#333;margin-bottom:12px;font-style:italic;">"Produs excelent! L-am primit în 10 zile și funcționează perfect."</p>
            <strong style="color:#1a1a2e;">— Maria D., București</strong>
          </div>
          <div style="padding:24px;background:#f8f9fa;border-radius:12px;border-left:4px solid #e74c3c;">
            <div style="color:#f39c12;margin-bottom:8px;">★★★★★</div>
            <p style="color:#333;margin-bottom:12px;font-style:italic;">"Super calitate pentru prețul ăsta. Recomand cu încredere!"</p>
            <strong style="color:#1a1a2e;">— Andrei P., Cluj</strong>
          </div>
        </div>
      </section>`,
  },
  {
    id: "urgency-section",
    label: "⏰ Urgență / Stoc Limitat",
    category: "Conversie",
    content: `
      <section style="padding:30px 20px;background:#e74c3c;color:#fff;text-align:center;">
        <p style="font-size:1.1rem;font-weight:600;margin-bottom:8px;">⚠️ STOC LIMITAT — Mai sunt doar câteva bucăți!</p>
        <p style="opacity:0.9;margin-bottom:20px;">Comandă acum și beneficiezi de prețul promoțional</p>
        <div class="unitone-releasit-btn" style="display:inline-block;min-width:220px;min-height:54px;"></div>
      </section>`,
  },
  {
    id: "faq-section",
    label: "❓ FAQ",
    category: "Secțiuni",
    content: `
      <section style="padding:50px 20px;background:#f8f9fa;">
        <h2 style="text-align:center;font-size:1.8rem;margin-bottom:32px;color:#1a1a2e;">Întrebări Frecvente</h2>
        <div style="max-width:700px;margin:0 auto;">
          <details style="background:#fff;padding:20px;border-radius:8px;margin-bottom:12px;cursor:pointer;">
            <summary style="font-weight:600;color:#1a1a2e;">Cum funcționează plata la livrare?</summary>
            <p style="color:#666;margin-top:12px;">Plăteşti curierului în momentul în care primeşti coletul acasă.</p>
          </details>
          <details style="background:#fff;padding:20px;border-radius:8px;margin-bottom:12px;cursor:pointer;">
            <summary style="font-weight:600;color:#1a1a2e;">Cât durează livrarea?</summary>
            <p style="color:#666;margin-top:12px;">Livrarea durează între 7-14 zile lucrătoare.</p>
          </details>
          <details style="background:#fff;padding:20px;border-radius:8px;cursor:pointer;">
            <summary style="font-weight:600;color:#1a1a2e;">Pot returna produsul?</summary>
            <p style="color:#666;margin-top:12px;">Da, ai 30 de zile la dispoziție pentru retur gratuit.</p>
          </details>
        </div>
      </section>`,
  },
  {
    id: "cta-final",
    label: "🚀 CTA Final",
    category: "Conversie",
    content: `
      <section style="padding:60px 20px;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;text-align:center;">
        <h2 style="font-size:2rem;margin-bottom:16px;">Comandă Acum și Economisești!</h2>
        <p style="opacity:0.85;margin-bottom:32px;font-size:1.1rem;">Plată la livrare • Garanție 30 zile • Livrare rapidă</p>
        <div class="unitone-releasit-btn" style="display:inline-block;min-width:220px;min-height:54px;"></div>
      </section>`,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Editor({ initialHtml = "", onSave }) {
  const editorRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      components: initialHtml || getDefaultTemplate(),
      height: "calc(100vh - 80px)",
      storageManager: false,
      blockManager: {
        appendTo: "#blocks-panel",
      },
      styleManager: {
        appendTo: "#styles-panel",
        sectors: [
          {
            name: "Tipografie",
            open: false,
            properties: ["font-family", "font-size", "font-weight", "color", "text-align"],
          },
          {
            name: "Dimensiuni",
            open: false,
            properties: ["width", "height", "padding", "margin"],
          },
          {
            name: "Fundal",
            open: false,
            properties: ["background-color", "background-image"],
          },
          {
            name: "Border",
            open: false,
            properties: ["border-radius", "border"],
          },
        ],
      },
      layerManager: { appendTo: "#layers-panel" },
      traitManager: { appendTo: "#traits-panel" },
      deviceManager: {
        devices: [
          { name: "Desktop", width: "" },
          { name: "Tablet", width: "768px", widthMedia: "992px" },
          { name: "Mobile", width: "375px", widthMedia: "480px" },
        ],
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap",
        ],
      },
      plugins: [],
    });

    // Înregistrăm blocurile
    BLOCKS.forEach((block) => {
      editor.BlockManager.add(block.id, {
        label: block.label,
        category: block.category,
        content: block.content,
        attributes: { class: "fa fa-th-large" },
      });
    });

    // Buton Save custom
    editor.Panels.addButton("options", {
      id: "save-btn",
      className: "fa fa-floppy-o",
      command: "save-content",
      attributes: { title: "Salvează LP" },
    });

    editor.Commands.add("save-content", {
      run(ed) {
        const html = ed.getHtml();
        const css = ed.getCss();
        const fullHtml = `<style>${css}</style>${html}`;
        if (onSave) onSave(fullHtml);
      },
    });

    editorRef.current = editor;

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // Actualizăm conținutul dacă se schimbă initialHtml după mount
  useEffect(() => {
    if (editorRef.current && initialHtml) {
      editorRef.current.setComponents(initialHtml);
    }
  }, [initialHtml]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar stânga — Blocuri */}
      <div
        style={{
          width: 220,
          background: "#1a1a2e",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            borderBottom: "1px solid #2d2d4e",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Blocuri
        </div>
        <div id="blocks-panel" />
      </div>

      {/* Canvas central */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div ref={containerRef} style={{ flex: 1 }} />
      </div>

      {/* Sidebar dreapta — Stiluri + Straturi */}
      <div
        style={{
          width: 260,
          background: "#16213e",
          color: "#fff",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 13,
            borderBottom: "1px solid #2d2d4e",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Stiluri
        </div>
        <div id="styles-panel" />
        <div
          style={{
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 13,
            borderBottom: "1px solid #2d2d4e",
            borderTop: "1px solid #2d2d4e",
            marginTop: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Proprietăți
        </div>
        <div id="traits-panel" />
        <div
          style={{
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 13,
            borderBottom: "1px solid #2d2d4e",
            borderTop: "1px solid #2d2d4e",
            marginTop: 8,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Straturi
        </div>
        <div id="layers-panel" />
      </div>
    </div>
  );
}

// ─── Template implicit (când nu vine HTML din Generator) ─────────────────────

function getDefaultTemplate() {
  return `
    <section style="background:#1a1a2e;color:#fff;padding:60px 20px;text-align:center;">
      <h1 style="font-size:2.5rem;font-weight:800;margin-bottom:16px;">Titlul Produsului Tău</h1>
      <p style="font-size:1.2rem;opacity:0.85;margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto;">
        Descriere convingătoare despre produs. Editează acest text.
      </p>
      <div class="unitone-releasit-btn" style="display:inline-block;min-width:220px;min-height:54px;border:2px dashed rgba(255,255,255,0.3);border-radius:8px;padding:4px;">
        <span style="color:rgba(255,255,255,0.5);font-size:12px;">Buton COD — apare automat</span>
      </div>
    </section>
    <section style="padding:50px 20px;background:#f8f9fa;text-align:center;">
      <p style="color:#666;">Adaugă blocuri din panoul din stânga →</p>
    </section>
  `;
}
