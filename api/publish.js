// api/publish.js
const { prepareShopifyAuth } = require('./_shopifyAuth')
const { getPlan, countLPs } = require('./_plan')

const OVERLAY_STYLE = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box'
const EMBED_STYLE = 'background:#fff;width:100%;max-width:100%;margin:0 auto'

function applyWrapper(html, mode) {
  const style = mode === 'embed' ? EMBED_STYLE : OVERLAY_STYLE
  const wrapperMatch = html.match(/<div[^>]*id="unitone-lp"[^>]*>/)
  if (wrapperMatch) {
    const newWrapper = wrapperMatch[0]
      .replace(/\sstyle="[^"]*"/, '')
      .replace(/>$/, ` style="${style}">`)
    return html.replace(wrapperMatch[0], newWrapper)
  }
  return `<div id="unitone-lp" style="${style}">${html}</div><!--/unitone-lp-->`
}

function ensureCloseMarker(html) {
  if (html.includes('<!--/unitone-lp-->')) return html
  const lastClose = html.lastIndexOf('</div>')
  if (lastClose === -1) return html + '<!--/unitone-lp-->'
  return html.slice(0, lastClose + 6) + '<!--/unitone-lp-->' + html.slice(lastClose + 6)
}

function buildOverlay(html) { return ensureCloseMarker(applyWrapper(html, 'overlay')) }
function buildEmbed(html) { return ensureCloseMarker(applyWrapper(html, 'embed')) }

function buildHideScript() {
  // Pentru OVERLAY mode (hideHeaderFooter=true): ascunde HEADER + FOOTER ale temei
  // PLUS elementele native produs (titlu/pret/form) care s-ar rendar alaturi de LP.
  // ATENTIE: NU ascundem .product__info-container, .product, .product__main —
  // acestea sunt WRAPPER-ele in care tema pune body_html (=LP-ul nostru). Daca
  // le ascundem, ascundem si LP-ul!
  return '<style>\n' +
    'html,body{margin:0!important;padding:0!important;background:#fff!important}\n' +
    /* Header / footer / nav theme — selectori specifici (NU container wrappers) */
    'header[role="banner"],footer[role="contentinfo"],' +
    'nav.site-nav,.site-header,.site-footer,' +
    '.shopify-section-header,.shopify-section-footer,' +
    '#shopify-section-header,#shopify-section-footer,' +
    'div.announcement-bar,div.sticky-header,' +
    '.header-wrapper,.footer-wrapper,' +
    '.section-header-wrapper,.section-footer-wrapper' +
    '{display:none!important}\n' +
    /* Native product page elements (DOAR cele care apar ca peers la body_html,
       NU containerul de body_html in sine). Restrictie cu selector copil pentru
       siguranta — daca theme-ul wrapezza body_html intr-un .product__info,
       elementele lui directe se ascund dar restul wrappers raman intacte. */
    '.product__title,h1.product-single__title,h1.product__heading,' +
    '.product__view-details,.product__pickup-availabilities,' +
    '.product-form__buttons,.shopify-payment-button,' +
    '.price--listing,.product__price--listing' +
    '{display:none!important}\n' +
    /* Hide native product MEDIA only if NOT inside our LP wrapper */
    '.product__media-list:not(#unitone-lp *),.product__media-wrapper:not(#unitone-lp *)' +
    '{display:none!important}\n' +
    '</style>'
}

// Forteaza LP-ul sa fie full-width PESTE constrangerile de theme.liquid (Dawn,
// Horizon, etc). Necesar pentru cazurile in care templeturile noastre nu se
// instaleaza si LP-ul cade pe theme.liquid care impune max-width via
// .page-width / .container.
// SAFER: doar max-width override, fara display:none care risca sa ascunda
// elemente din LP cand theme-ul wrapezza body_html in aceste clase.
function buildFullWidthOverride() {
  return '<style>\n' +
    '#unitone-lp,#unitone-lp *{box-sizing:border-box}\n' +
    /* Cancel theme width constraints — only specific container classes */
    '.page-width,.shopify-section .page-width,.container > .container,main.main-content,#MainContent .page-width{max-width:100%!important;padding-left:0!important;padding-right:0!important}\n' +
    '#unitone-lp{max-width:100%!important;width:100%!important;margin:0!important}\n' +
    '</style>'
}

// Universal COD form mode — works with BOTH Releasit and EasySell out of the box.
// Selectors below use CLASS (not ID), so multiple buttons per page all get processed
// instead of just the first one. The hidden `_rsi-cod-form-is-gempage` marker tells
// Releasit's storefront script that this page is a GemPages-style integration.
//
// Defensive fallback: after 3s, if a hook still contains our placeholder span
// (meaning neither Releasit nor EasySell processed it — either not installed,
// integration not enabled in app settings, or script not loaded on the template),
// we inject a visible "COMANDĂ ACUM" button so the customer at least sees SOMETHING
// instead of an invisible 0px element. The fallback button shows an alert telling
// the merchant what to fix.
function buildCodFormUniversal() {
  return [
    '<div class="_rsi-cod-form-is-gempage" style="display:none"></div>',
    '<style>',
    '.unitone-placeholder-text{display:none!important}',
    '.unitone-cod-hook,._rsi-cod-form-gempages-button-hook,.es-form-hook,.unitone-rel-hook,.unitone-releasit-btn{border:none!important;background:transparent!important;padding:0!important;min-height:0!important}',
    '.unitone-cod-fallback{display:block;width:100%;background:#dc2626;color:#fff;padding:18px 24px;border-radius:8px;text-align:center;font-size:17px;font-weight:900;text-decoration:none;cursor:pointer;border:none;font-family:inherit;letter-spacing:0.5px;box-sizing:border-box}',
    '.unitone-cod-fallback:hover{background:#b91c1c}',
    '</style>',
    '<script>(function(){',
      // Show a real button INSTANTLY (no 3s wait). If Releasit/EasySell
      // process the hook, they will replace the inner button with their
      // own. If they don't, the user still has a clickable button.
      'function paint(){',
        'var hooks=document.querySelectorAll(".unitone-cod-hook,._rsi-cod-form-gempages-button-hook,.es-form-hook");',
        'hooks.forEach(function(h){',
          'if(h.dataset.unitonePainted)return;',
          'var hasPlaceholder=h.querySelector(".unitone-placeholder-text");',
          'var isEmpty=h.children.length===0&&h.textContent.trim()==="";',
          'if(hasPlaceholder||isEmpty){',
            'h.innerHTML="";',
            'h.dataset.unitonePainted="1";',
            'var b=document.createElement("button");',
            'b.className="unitone-cod-fallback";',
            'b.type="button";',
            'b.innerHTML="\\ud83d\\udecd COMAND\\u0102 ACUM";',
            'b.onclick=function(){',
              // Diagnostic alert — tells the merchant EXACTLY what's missing
              'var rsiLoaded=!!window.RsiCodForm||!!window.RsiCheckout||!!window._rsi;',
              'var esLoaded=!!window.EasySellCodForm||!!window.easysell||document.querySelector("[data-easysell],script[src*=\\"easysell\\"]");',
              'var hookCount=document.querySelectorAll("._rsi-cod-form-gempages-button-hook,.es-form-hook,.unitone-cod-hook").length;',
              'var markerEl=document.querySelector("._rsi-cod-form-is-gempage");',
              'var pjsonEl=document.querySelector(\'[id^=\\"product-json\\"]\');',
              'var msg="Diagnostic Releasit / EasySell:\\n\\n"',
                '+"\\u2022 Hooks detectate \\u00een DOM: "+hookCount+"\\n"',
                '+"\\u2022 Marker _rsi-cod-form-is-gempage: "+(markerEl?"DA":"NU")+"\\n"',
                '+"\\u2022 product-json node: "+(pjsonEl?"DA ("+pjsonEl.id+")":"NU")+"\\n"',
                '+"\\u2022 Releasit script loaded: "+(rsiLoaded?"DA":"NU")+"\\n"',
                '+"\\u2022 EasySell script loaded: "+(esLoaded?"DA":"NU")+"\\n\\n";',
              'if(!rsiLoaded&&!esLoaded){',
                'msg+="\\u26A0 Niciun app COD nu \\u00ee\\u021bi \\u00eencarc\\u0103 scriptul.\\n";',
                'msg+="Mergi la Online Store \\u2192 Themes \\u2192 Customize \\u2192 App embeds, activeaz\\u0103 Releasit / EasySell, Save.";',
              '}else if(!markerEl){',
                'msg+="\\u26A0 Marker-ul lipse\\u0219te \\u2014 contacteaz\\u0103 dezvoltatorul.";',
              '}else if(!pjsonEl){',
                'msg+="\\u26A0 product-json lipse\\u0219te \\u2014 template-ul temei nu e actualizat. Reload\\u0103 app-ul UnitOne.";',
              '}else{',
                'msg+="\\u26A0 Toate semnalele sunt prezente. Mergi \\u00een app-ul COD \\u2192 Settings \\u2192 verific\\u0103 dac\\u0103 form-ul este designat \\u0219i salvat.";',
              '}',
              'alert(msg);',
            '};',
            'h.appendChild(b);',
          '}',
        '});',
      '}',
      // Paint twice: once IMMEDIATELY (so buttons appear on load), then again
      // after 1.5s in case Releasit took longer than expected (paint() is
      // idempotent via the dataset.unitonePainted flag).
      'if(document.readyState!=="loading"){paint();}else{document.addEventListener("DOMContentLoaded",paint);}',
      'setTimeout(paint,1500);',
    '})();</script>'
  ].join('')
}

// Universal popup handler — gaseste toate .unitone-popup-block in DOM,
// citeste data-trigger / data-delay / data-goal, le transforma in overlay
// fixed-position cu trigger comportament. Cardul inline e ascuns (display:none)
// dupa setup. La trigger, overlay-ul cloneaza cardul si il afiseaza.
// CTA behavior:
//   - data-goal="discount" → copy cod in clipboard + close
//   - data-goal="order"    → close popup + scroll smooth la #unitone-cod-anchor
// Trigger types:
//   - data-trigger="time" + data-delay=N → arata dupa N secunde
//   - data-trigger="scroll" → arata cand userul scrolleaza peste pozitia block-ului
function buildPopupHandler() {
  // Citeste TOATE traits-urile (data-*) de pe .unitone-popup-block si
  // construieste overlay-ul cu styles aplicate (overlay color/opacity,
  // popup bg/corner/shadow/position, entrance effect, close btn config).
  // Trigger: time/scroll/exit/none. Goal CTA: discount/order/close.
  return [
    '<script>(function(){',
    'function setupPopups(){',
      'var blocks=document.querySelectorAll(".unitone-popup-block");',
      'if(!blocks.length)return;',
      // CSS pentru entrance effects + position classes
      'var styleEl=document.createElement("style");',
      'styleEl.textContent="@keyframes unitone-pop-fade{from{opacity:0}to{opacity:1}}"+',
        '"@keyframes unitone-pop-zoom{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}"+',
        '"@keyframes unitone-pop-slide-up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}"+',
        '"@keyframes unitone-pop-slide-down{from{opacity:0;transform:translateY(-40px)}to{opacity:1;transform:translateY(0)}}";',
      'document.head.appendChild(styleEl);',
      'blocks.forEach(function(block){',
        // Citeste toate traits-urile cu fallbacks
        'function attr(k,d){var v=block.getAttribute(k);return v==null||v===""?d:v}',
        'var trigger=attr("data-trigger","time");',
        'var delay=parseInt(attr("data-delay","30"),10);',
        'var goal=attr("data-goal","discount");',
        'var overlayColor=attr("data-overlay-color","#121212");',
        'var overlayOpacity=parseInt(attr("data-overlay-opacity","70"),10);',
        'var overlayClickClose=attr("data-overlay-click-close","yes")==="yes";',
        'var fullscreen=attr("data-fullscreen","no")==="yes";',
        'var width=attr("data-width","600");',
        'var height=attr("data-height","auto");',
        'var padding=parseInt(attr("data-padding","32"),10);',
        'var bgColor=attr("data-bg-color","#FFFFFF");',
        'var bgImage=attr("data-bg-image","");',
        'var corner=parseInt(attr("data-corner","14"),10);',
        'var shadow=attr("data-shadow","0 20px 60px rgba(0,0,0,0.3)");',
        'var position=attr("data-position","center");',
        'var entrance=attr("data-entrance","fade");',
        'var closeColor=attr("data-close-color","#FFFFFF");',
        'var closeBg=attr("data-close-bg","#121212");',
        'var closeW=parseInt(attr("data-close-w","32"),10);',
        'var closeH=parseInt(attr("data-close-h","32"),10);',
        'var closeSize=parseInt(attr("data-close-size","16"),10);',
        // Anchor pentru scroll trigger
        'var anchor=document.createElement("div");',
        'anchor.style.cssText="height:0;width:0;overflow:hidden";',
        'block.parentNode.insertBefore(anchor,block);',
        // Convert overlay opacity (%) to rgba alpha
        'function hexToRgba(hex,alpha){',
          'var h=hex.replace("#","");',
          'if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];',
          'var r=parseInt(h.substring(0,2),16),g=parseInt(h.substring(2,4),16),b=parseInt(h.substring(4,6),16);',
          'return "rgba("+r+","+g+","+b+","+(alpha/100)+")";',
        '}',
        // Position align mappings
        'var alignMap={',
          '"center":"align-items:center;justify-content:center",',
          '"top":"align-items:flex-start;justify-content:center;padding-top:60px",',
          '"bottom":"align-items:flex-end;justify-content:center;padding-bottom:60px",',
          '"top-left":"align-items:flex-start;justify-content:flex-start;padding:60px 60px",',
          '"top-right":"align-items:flex-start;justify-content:flex-end;padding:60px 60px",',
          '"bottom-left":"align-items:flex-end;justify-content:flex-start;padding:60px 60px",',
          '"bottom-right":"align-items:flex-end;justify-content:flex-end;padding:60px 60px"',
        '};',
        // Construim overlay
        'var overlay=document.createElement("div");',
        'overlay.className="unitone-popup-overlay";',
        'overlay.style.cssText="display:none;position:fixed;inset:0;background:"+hexToRgba(overlayColor,overlayOpacity)+";z-index:99999;"+alignMap[position]||alignMap.center;',
        'if(overlayClickClose){',
          'overlay.addEventListener("click",function(e){if(e.target===overlay)hide()});',
        '}',
        // Clonam block-ul (cu toate elementele drop-uite inauntru) ca popup card
        'var clone=block.cloneNode(true);',
        // Sterge editor-only labels si side-effect classes
        'var lbl=clone.querySelector(".unitone-popup-editor-label");',
        'if(lbl)lbl.parentNode.removeChild(lbl);',
        // Styles pe clone (overrride peste cele inline)
        'var cs="background:"+bgColor+";";',
        'if(bgImage)cs+="background-image:url(\'"+bgImage+"\');background-size:cover;background-position:center;";',
        'cs+="border-radius:"+corner+"px;padding:"+padding+"px;box-shadow:"+shadow+";position:relative;margin:0;";',
        'if(fullscreen){cs+="width:100vw;height:100vh;max-width:none;border-radius:0;"}',
        'else{cs+="width:"+(width.toString().indexOf("px")<0&&width!=="auto"?width+"px":width)+";max-width:calc(100vw - 40px);";if(height&&height!=="auto"){cs+="height:"+height+(height.toString().indexOf("px")<0?"px":"")+";"}}',
        'cs+="animation:unitone-pop-"+(entrance==="none"?"fade":entrance)+" 0.4s cubic-bezier(0.16,1,0.3,1);";',
        'clone.setAttribute("style",cs);',
        // Style on close button (citeste din traits)
        'var closeBtn=clone.querySelector(".unitone-popup-close");',
        'if(closeBtn){',
          'closeBtn.setAttribute("style","position:absolute;top:10px;right:10px;background:"+closeBg+";color:"+closeColor+";border:0;width:"+closeW+"px;height:"+closeH+"px;border-radius:50%;font-size:"+closeSize+"px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:bold;z-index:2");',
          'closeBtn.addEventListener("click",hide);',
        '}',
        'overlay.appendChild(clone);',
        'document.body.appendChild(overlay);',
        // Ascunde originalul din pagina
        'block.style.display="none";',
        // CTA wiring (cauta primul .unitone-popup-cta din clone)
        'var cta=clone.querySelector(".unitone-popup-cta");',
        'if(cta){',
          'cta.addEventListener("click",function(){',
            'if(goal==="discount"){',
              'var codeEl=clone.querySelector(".unitone-popup-code");',
              'if(codeEl&&navigator.clipboard){',
                'try{navigator.clipboard.writeText(codeEl.textContent.trim())}catch(e){}',
              '}',
              'cta.textContent="Cod copiat \\u2713";',
              'setTimeout(hide,900);',
            '}else if(goal==="order"){',
              'hide();',
              'var target=document.getElementById("unitone-cod-anchor")||document.querySelector(".unitone-cod-hook")||document.querySelector("._rsi-cod-form-gempages-button-hook")||document.querySelector(".es-form-hook");',
              'if(target)setTimeout(function(){target.scrollIntoView({behavior:"smooth",block:"center"})},80);',
            '}else{',
              'hide();',
            '}',
          '});',
        '}',
        // ESC inchide
        'document.addEventListener("keydown",function(e){if(e.key==="Escape")hide()});',
        // Show / hide logic
        'var shown=false;',
        'function hide(){overlay.style.display="none"}',
        'function show(){',
          'if(shown)return;',
          'try{if(sessionStorage.getItem("unitone-popup-"+block.id+"-shown")==="1")return}catch(e){}',
          'shown=true;',
          'overlay.style.display="flex";',
          'try{sessionStorage.setItem("unitone-popup-"+block.id+"-shown","1")}catch(e){}',
        '}',
        // Trigger setup
        'if(trigger==="time"){',
          'setTimeout(show,delay*1000);',
        '}else if(trigger==="scroll"){',
          'if("IntersectionObserver" in window){',
            'var obs=new IntersectionObserver(function(entries){',
              'entries.forEach(function(en){',
                'if(en.isIntersecting||en.boundingClientRect.bottom<0){show();obs.disconnect()}',
              '});',
            '},{threshold:0.1,rootMargin:"0px 0px -20% 0px"});',
            'obs.observe(anchor);',
          '}else{',
            'window.addEventListener("scroll",function(){',
              'var r=anchor.getBoundingClientRect();',
              'if(r.top<window.innerHeight*0.8)show();',
            '});',
          '}',
        '}else if(trigger==="exit"){',
          'document.addEventListener("mouseout",function(e){',
            'if(!e.relatedTarget&&e.clientY<10)show();',
          '});',
        '}',
      '});',
    '}',
    'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",setupPopups)}else{setupPopups()}',
    '})();</script>'
  ].join('')
}

// Builds the product-json script element COD apps look for to bind variant info.
// Format matches Releasit's official GemPages snippet (type="text/plain",
// class="product-json", id="product-json{productId}"). Injected directly into
// body_html so we don't depend on the theme template being re-installed.
async function buildProductJsonScript(call, productId) {
  try {
    const data = await call('/products/' + productId + '.json')
    const p = data.product
    if (!p) return ''
    // Trim down to fields the COD apps use — keeps the inline script small.
    const slim = {
      id: p.id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor,
      type: p.product_type,
      tags: p.tags,
      price: p.variants?.[0]?.price,
      available: p.variants?.some(v => v.inventory_quantity > 0 || v.inventory_management === null) ?? true,
      variants: (p.variants || []).map(v => ({
        id: v.id, title: v.title, price: v.price,
        available: v.inventory_quantity > 0 || v.inventory_management === null,
        sku: v.sku, option1: v.option1, option2: v.option2, option3: v.option3
      })),
      images: (p.images || []).map(i => i.src),
      featured_image: p.image?.src || null
    }
    return `<script type="text/plain" class="product-json" id="product-json${p.id}">${JSON.stringify(slim)}</script>`
  } catch (e) {
    console.log('buildProductJsonScript error:', e.message)
    return ''
  }
}

// Server-side price sync — la publish, citim pretul real al produsului si
// inlocuim placeholder-ul AI din body_html. String replace pur, fara DOM
// parsing, deci NU strica layout-ul GrapesJS. Identic cu butonul manual
// "Aplica pret pe LP" din editor, dar automat la publish.
async function syncPriceToProduct(html, call, productId) {
  try {
    const data = await call('/products/' + productId + '.json')
    const variantPrice = data.product?.variants?.[0]?.price
    if (!variantPrice) return html
    const realPrice = Math.round(parseFloat(variantPrice))
    if (!realPrice || isNaN(realPrice)) return html
    const newOldPrice = Math.round(realPrice * 1.6)
    const savings = newOldPrice - realPrice
    // Pattern strict pe span-ul mare de pret (font-size:42px folosit in hero)
    return html
      .replace(/(<span[^>]*font-size:42px[^>]*>)(\d+)(<\/span>)/g, `$1${realPrice}$3`)
      .replace(/(<span[^>]*text-decoration:line-through[^>]*>)(\d+)( LEI<\/span>)/g, `$1${newOldPrice}$3`)
      .replace(/Economise(s|ș)ti \d+ LEI/g, `Economise$1ti ${savings} LEI`)
  } catch (e) {
    console.log('syncPriceToProduct error:', e.message)
    return html
  }
}

// Data-bound product block sync — gaseste elementele cu data-unitone-bind="X"
// si le inlocuieste cu valorile reale din produsul Shopify. Astea sunt block-uri
// "Produs (auto)" pe care user-ul le pune in editor — vor afisa mereu datele
// curente ale produsului (imagine, titlu, pret, comparare), nu placeholder-uri.
async function bindProductBlocks(html, call, productId) {
  // Skip rapid daca nu sunt block-uri data-bound in HTML
  if (!html.includes('data-unitone-bind')) return html
  try {
    const data = await call('/products/' + productId + '.json')
    const p = data.product
    if (!p) return html
    const realPrice = Math.round(parseFloat(p.variants?.[0]?.price || 0))
    const compareAt = parseFloat(p.variants?.[0]?.compare_at_price || 0)
    const oldPrice = compareAt > realPrice ? Math.round(compareAt) : Math.round(realPrice * 1.6)
    const savings = oldPrice - realPrice
    const discount = oldPrice > 0 ? Math.round((1 - realPrice / oldPrice) * 100) : 0
    const imgSrc = p.image?.src || p.images?.[0]?.src || ''
    const title = (p.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    // Description din Shopify product (body_html original, plain text fallback)
    const rawDesc = (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    const descText = rawDesc.length > 800 ? rawDesc.substring(0, 800) + '...' : rawDesc

    let out = html
    // Inlocuieste IMG src — atributul src dintr-un <img data-unitone-bind="image" src="...">
    if (imgSrc) {
      out = out.replace(/(<img[^>]*data-unitone-bind="image"[^>]*\ssrc=")[^"]*(")/g, `$1${imgSrc}$2`)
    }
    // Inlocuieste textul dintr-un <h1 data-unitone-bind="title">...</h1> (sau alt tag)
    out = out.replace(/(<(?:h1|h2|h3|span|div|p)[^>]*data-unitone-bind="title"[^>]*>)[^<]*(<\/(?:h1|h2|h3|span|div|p)>)/g, `$1${title}$2`)
    if (realPrice > 0) {
      out = out.replace(/(<(?:span|div)[^>]*data-unitone-bind="price"[^>]*>)[^<]*(<\/(?:span|div)>)/g, `$1${realPrice}$2`)
      out = out.replace(/(<(?:span|div)[^>]*data-unitone-bind="compareAt"[^>]*>)[^<]*(<\/(?:span|div)>)/g, `$1${oldPrice} LEI$2`)
      out = out.replace(/(<(?:span|div)[^>]*data-unitone-bind="discount"[^>]*>)[^<]*(<\/(?:span|div)>)/g, `$1-${discount}%$2`)
      out = out.replace(/(<(?:span|div|p)[^>]*data-unitone-bind="savings"[^>]*>)[^<]*(<\/(?:span|div|p)>)/g, `$1Economisești ${savings} LEI$2`)
    }
    // Description block (plain text, escape simplu)
    if (descText) {
      const safeDesc = descText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      out = out.replace(/(<(?:div|p|span)[^>]*data-unitone-bind="description"[^>]*>)[\s\S]*?(<\/(?:div|p|span)>)/g, `$1${safeDesc}$2`)
    }
    console.log('bindProductBlocks: applied real data for product', p.id, 'price', realPrice)
    return out
  } catch (e) {
    console.log('bindProductBlocks error:', e.message)
    return html
  }
}

// Detects whether the page has any COD button hook (either app, either marker).
function hasCodHook(html) {
  return html.includes('_rsi-cod-form-gempages-button-hook')
      || html.includes('es-form-hook')
      || html.includes('unitone-cod-hook')
      || html.includes('unitone-rel-hook')
}

// Matches a <div ... class="...HOOK_CLASS..."> regardless of attribute order
// (GrapesJS emits data-cod="..." id="..." BEFORE class, so the old "class right
// after <div" regex never matched and our injections silently no-op'd).
const HOOK_DIV_RE = /<div((?:\s+[a-zA-Z-]+="[^"]*")*?)\s+class="([^"]*(?:unitone-cod-hook|_rsi-cod-form-gempages-button-hook|es-form-hook|unitone-rel-hook)[^"]*)"/i
const HOOK_DIV_RE_GLOBAL = new RegExp(HOOK_DIV_RE.source, 'gi')

// Adds id="unitone-cod-anchor" to the FIRST hook element on the page. Used by
// the auto-generated CTA scroll buttons (`<a href="#unitone-cod-anchor">`) so
// "Comandă acum" anchor links jump to the actual COD button location.
function addAnchorToFirstHook(html) {
  return html.replace(HOOK_DIV_RE, '<div id="unitone-cod-anchor"$1 class="$2"')
}

// Releasit V2 + EasySell both bind to hooks via data-product-id. Without this,
// they don't know which product to attach the COD form to and silently skip
// the hook (even though their bundle has loaded and globals are present).
// We inject these on EVERY hook on the page (not just first) so multi-button
// pages all work. Also adds data-rsi-product-id which Releasit V2 prefers.
function addProductIdToAllHooks(html, productId) {
  if (!productId) return html
  return html.replace(
    HOOK_DIV_RE_GLOBAL,
    `<div data-product-id="${productId}" data-rsi-product-id="${productId}"$1 class="$2"`
  )
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const body = req.body || {}
    const { title, html, action, productId, hideHeaderFooter, codFormApp, variantId } = body
    const auth = await prepareShopifyAuth(req, res)

    // Editor source metafield: pure GrapesJS html + css for lossless re-edit.
    // Shopify updates existing metafields when namespace+key match.
    const editorSourceMetafield = (body.editorHtml || body.editorCss) ? {
      metafields: [{
        namespace: 'unitone',
        key: 'editor_source',
        type: 'json',
        value: JSON.stringify({ html: body.editorHtml || '', css: body.editorCss || '' })
      }]
    } : {}

    if (action === 'get_products') {
      const data = await auth.call('/products.json?limit=50&fields=id,title,handle,images,variants')
      return res.status(200).json({ success: true, products: data.products || [] })
    }

    if (action === 'update') {
      const { pageId } = body
      if (!pageId) return res.status(400).json({ error: 'Missing pageId' })
      let finalHtml = html
      // Data-bind: inlocuieste data-unitone-bind="X" cu valorile reale ale produsului
      finalHtml = await bindProductBlocks(finalHtml, auth.call, pageId)
      // Sync pret AI placeholder (font-size:42px hero) -> pretul produsului
      finalHtml = await syncPriceToProduct(finalHtml, auth.call, pageId)
      if (codFormApp || hasCodHook(finalHtml)) {
        finalHtml = addProductIdToAllHooks(finalHtml, pageId)
        finalHtml = addAnchorToFirstHook(finalHtml)
        const pjs = await buildProductJsonScript(auth.call, pageId)
        // Shopify.template MUST be "product" so Releasit / EasySell scripts don't
        // early-exit. Inject this as the very first thing so it runs before
        // any deferred external script that gates on it.
        const shopifyTemplateShim = '<script>window.Shopify=window.Shopify||{};window.Shopify.template="product";window.Shopify.theme=window.Shopify.theme||{};window.Shopify.theme.template="product";</script>'
        finalHtml = shopifyTemplateShim + pjs + buildCodFormUniversal() + finalHtml
      }

      let templateSuffix
      if (hideHeaderFooter === false) {
        finalHtml = buildEmbed(finalHtml)
        templateSuffix = 'pagecodfull'
      } else {
        finalHtml = buildOverlay(finalHtml)
        finalHtml = buildHideScript() + finalHtml
        templateSuffix = 'pagecod'
      }
      // Forteaza full-width chiar daca templeturile noastre n-au prins
      finalHtml = buildFullWidthOverride() + finalHtml

      // IMPORTANT: nu trimitem title pe UPDATE — daca user-ul redenumeste LP-ul
      // in editor, NU vrem sa schimbam numele produsului Shopify (al lor real).
      // LP title se pastreaza ca metafield separat (unitone:lp_title) ca sa-l
      // afisam in dashboard, dar product.title ramane intact.
      const lpTitleMetafield = title ? {
        metafields: [
          ...(editorSourceMetafield.metafields || []),
          { namespace: 'unitone', key: 'lp_title', type: 'single_line_text_field', value: String(title).slice(0, 250) }
        ]
      } : editorSourceMetafield

      const result = await auth.call('/products/' + pageId + '.json', 'PUT', {
        product: { id: pageId, body_html: finalHtml, template_suffix: templateSuffix, ...lpTitleMetafield }
      })
      if (result.product) {
        return res.status(200).json({ success: true, pageUrl: 'https://' + auth.shop + '/products/' + result.product.handle, template_suffix: templateSuffix })
      }
      throw new Error(JSON.stringify(result.errors || 'Update failed'))
    }

    if (!html) return res.status(400).json({ error: 'Missing html' })
    if (!productId) return res.status(400).json({ error: 'Selecteaza un produs!' })

    const plan = await getPlan(auth.call, auth.shop)
    const counts = await countLPs(auth.call)
    if (counts.total >= plan.limit) {
      return res.status(402).json({ error: 'limit_reached', plan: plan.plan, limit: plan.limit })
    }
    const newStatus = counts.active >= plan.publishLimit ? 'draft' : 'active'

    let finalHtml = html
    // Data-bind product blocks (Produs (auto)) cu valorile reale ale produsului
    finalHtml = await bindProductBlocks(finalHtml, auth.call, productId)
    // Sync pret AI placeholder (font-size:42px hero) -> pretul produsului
    finalHtml = await syncPriceToProduct(finalHtml, auth.call, productId)

    if (codFormApp || hasCodHook(finalHtml)) {
      finalHtml = addProductIdToAllHooks(finalHtml, productId)
      finalHtml = addAnchorToFirstHook(finalHtml)
      const pjs = await buildProductJsonScript(auth.call, productId)
      const shopifyTemplateShim = '<script>window.Shopify=window.Shopify||{};window.Shopify.template="product";window.Shopify.theme=window.Shopify.theme||{};window.Shopify.theme.template="product";</script>'
      finalHtml = shopifyTemplateShim + pjs + buildCodFormUniversal() + finalHtml
      console.log('COD universal hooks activated, variantId:', variantId, 'pjs:', pjs.length, 'bytes')
    } else if (variantId) {
      finalHtml = finalHtml.replace(/VARIANT_ID/g, variantId)
    }

    let templateSuffix
    if (hideHeaderFooter === false) {
      finalHtml = buildEmbed(finalHtml)
      templateSuffix = 'pagecodfull'
    } else {
      finalHtml = buildOverlay(finalHtml)
      finalHtml = buildHideScript() + finalHtml
      templateSuffix = 'pagecod'
    }
    // Forteaza full-width — defense in depth contra theme.liquid constraints
    finalHtml = buildFullWidthOverride() + finalHtml

    // Daca user-ul a adaugat popup-uri (block "unitone-popup-block"), atasam
    // scriptul universal care le transforma in overlay + trigger. Skip daca
    // nu exista popup pe pagina ca sa nu poluam DOM-ul cu script nefolosit.
    if (finalHtml.includes('unitone-popup-block')) {
      finalHtml = finalHtml + buildPopupHandler()
    }

    console.log('HTML size:', Math.round(finalHtml.length / 1024), 'KB, status:', newStatus, 'plan:', plan.plan, 'template:', templateSuffix)

    // Backup original body_html BEFORE overwriting — pe delete LP putem restaura
    // descrierea originala a produsului. Skip daca produsul are deja LP atasat
    // (tag-ul nostru) sau daca am salvat deja backup-ul.
    try {
      const current = await auth.call('/products/' + productId + '.json')
      const hasOurTag = (current.product?.tags || '').includes('unitone-cod-page')
      if (!hasOurTag && current.product?.body_html) {
        await auth.call('/products/' + productId + '/metafields.json', 'POST', {
          metafield: {
            namespace: 'unitone',
            key: 'original_body_html',
            type: 'multi_line_text_field',
            value: current.product.body_html.slice(0, 65535)
          }
        }).catch(() => {})
      }
    } catch (e) { console.log('Backup body_html skip:', e.message) }

    // IMPORTANT: NU trimitem title pe primul publish — produsul a fost selectat
    // de user din Shopify (numele lui real). LP title (numele dat de user in
    // editor) il salvam in metafield separat pentru afisare in dashboard-ul nostru.
    const lpTitleMetafield = title ? [
      { namespace: 'unitone', key: 'lp_title', type: 'single_line_text_field', value: String(title).slice(0, 250) }
    ] : []
    const allMetafields = [
      ...(editorSourceMetafield.metafields || []),
      ...lpTitleMetafield
    ]

    const result = await auth.call('/products/' + productId + '.json', 'PUT', {
      product: {
        id: productId,
        body_html: finalHtml,
        template_suffix: templateSuffix,
        tags: 'unitone-cod-page',
        status: newStatus,
        ...(allMetafields.length && { metafields: allMetafields })
      }
    })

    if (!result.product) throw new Error(JSON.stringify(result.errors || 'Product update failed'))
    console.log('LP published:', result.product.id, result.product.handle, 'status:', result.product.status, 'template:', result.product.template_suffix)

    res.status(200).json({
      success: true,
      pageUrl: 'https://' + auth.shop + '/products/' + result.product.handle,
      pageId: result.product.id,
      variantId: result.product.variants?.[0]?.id,
      demoted: newStatus === 'draft',
      status: newStatus,
      template_suffix: templateSuffix,
      plan: plan.plan,
      publishLimit: plan.publishLimit
    })

  } catch(err) {
    console.error('Publish error:', err.message)
    if (err.message === 'REAUTH_REQUIRED') {
      const shop = err.shop || ''
      return res.status(401).json({ success: false, error: 'reauth_required', shop, authUrl: '/api/auth?shop=' + shop })
    }
    const code = /Missing shop|No token/i.test(err.message) ? 401 : 500
    res.status(code).json({ success: false, error: err.message })
  }
}
