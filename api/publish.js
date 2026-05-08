// api/publish.js
// Publică LP-ul pe un produs Shopify cu template_suffix=pagecod
// Fix: MutationObserver mutat în HTML-ul generat, nu executat server-side

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { shop, token, productId, html, title } = req.body;

  if (!shop || !token || !productId || !html) {
    return res.status(400).json({ error: "Missing required fields: shop, token, productId, html" });
  }

  try {
    // Script MutationObserver care mută butonul Releasit în placeholder-ul corect
    const releasitScript = `
<script>
(function() {
  function moveReleasitButton() {
    var placeholder = document.querySelector('.unitone-releasit-btn');
    if (!placeholder) return;
    var btn = document.querySelector('._rsi-buy-now-button-app-block-hook');
    if (btn) {
      placeholder.innerHTML = '';
      placeholder.appendChild(btn);
      return true;
    }
    return false;
  }

  // Încearcă imediat
  if (!moveReleasitButton()) {
    // Dacă nu găsește, observă DOM-ul
    var observer = new MutationObserver(function(mutations, obs) {
      if (moveReleasitButton()) {
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout de siguranță după 10s
    setTimeout(function() { observer.disconnect(); }, 10000);
  }
})();
</script>`;

    // Injectăm scriptul înainte de </body> sau la final
    const htmlWithScript = html.includes("</body>")
      ? html.replace("</body>", releasitScript + "</body>")
      : html + releasitScript;

    // Update produs: description = HTML landing page, template_suffix = pagecod
    const updateResponse = await fetch(
      `https://${shop}/admin/api/2024-01/products/${productId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: {
            id: productId,
            body_html: htmlWithScript,
            template_suffix: "pagecod",
            ...(title && { title }),
          },
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Shopify publish error:", updateResponse.status, errorText);
      return res.status(updateResponse.status).json({
        error: "Failed to publish to Shopify",
        details: errorText,
      });
    }

    const updatedProduct = await updateResponse.json();

    return res.status(200).json({
      success: true,
      product: {
        id: updatedProduct.product.id,
        title: updatedProduct.product.title,
        handle: updatedProduct.product.handle,
        shopUrl: `https://${shop}/products/${updatedProduct.product.handle}?view=pagecod`,
      },
    });
  } catch (err) {
    console.error("publish.js error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
