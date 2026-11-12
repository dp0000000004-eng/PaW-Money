const BRAND_NAME = "Credora";
const OLD_NAME = "PaW-MoneY";
const LOGO_PATH = "./logo.jpeg";

function applyBranding() {
  document.title = "Credora — your money, in balance";
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.content = "Credora keeps your income, expenses, and monthly money history in one clear place.";
  }
  const icon = document.querySelector('link[rel~="icon"]');
  if (icon) {
    icon.href = LOGO_PATH;
    icon.type = "image/jpeg";
  }

  document.querySelectorAll(".brand").forEach((brand) => {
    const mark = brand.querySelector(".brand-mark");
    if (mark) {
      const image = document.createElement("img");
      image.src = LOGO_PATH;
      image.alt = "";
      image.width = 36;
      image.height = 36;
      image.style.cssText = "width:36px;height:36px;object-fit:cover;border-radius:13px";
      mark.replaceWith(image);
    }
    const label = brand.querySelector("span:last-child");
    if (label) label.textContent = BRAND_NAME;
    brand.setAttribute("aria-label", brand.getAttribute("aria-label")?.replace(OLD_NAME, BRAND_NAME) || BRAND_NAME);
  });

  // Update existing and later-rendered interface text without changing storage keys,
  // which preserves users' locally saved accounts and transaction history.
  const replaceText = (node) => {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.includes(OLD_NAME)) {
      node.nodeValue = node.nodeValue.replaceAll(OLD_NAME, BRAND_NAME);
    }
  };
  const updateText = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) replaceText(walker.currentNode);
  };
  updateText(document.body);
  new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "characterData") replaceText(record.target);
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) replaceText(node);
        else if (node.nodeType === Node.ELEMENT_NODE) updateText(node);
      });
    });
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyBranding, { once: true });
} else {
  applyBranding();
}
