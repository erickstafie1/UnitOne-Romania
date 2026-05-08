// api/pages.js
// Fix: folosim template_suffix=pagecod direct în URL query param
// Shopify nu returnează template_suffix prin fields= filter

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { shop, token } = req.query;
  if (!shop || !token) return res.status(400).json({ error: "Missing shop or token" });

  try {
    const url = `https://${shop}/admin/api/2024-01/products.json?template_suffix=pagecod&limit=250&fields=id,title,handle,status,image,updated_at,template_suffix`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API error:", response.status, errorText);
      return res.status(response.status).json({ error: "Shopify API error", details: errorText });
    }

    const data = await response.json();

    // Filtrare dublă client-side ca siguranță
    const landingPages = (data.products || []).filter(
      (p) => p.template_suffix === "pagecod"
    );

    const pages = landingPages.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      image: product.image?.src || null,
      updatedAt: product.updated_at,
      shopUrl: `https://${shop}/products/${product.handle}?view=pagecod`,
    }));

    return res.status(200).json({ pages, total: pages.length });
  } catch (err) {
    console.error("pages.js error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
