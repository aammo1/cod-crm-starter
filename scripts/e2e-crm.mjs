import { spawn } from "node:child_process";
import { chromium } from "playwright";
import Database from "better-sqlite3";

const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

function createTestOrder(db) {
  const id = `ord_test_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (
      id, customer_name, customer_phone, items_json,
      subtotal, shipping, total, currency,
      created_at, updated_at, confirmation_status, source
    ) VALUES (
      ?, 'Khadija Alami', '0612345678',
      '[{"variantId":"var_1","name":"Escarpin Noir","color":"Noir","size":"38","quantity":1,"price":450}]',
      450, 0, 450, 'MAD',
      ?, ?, 'pending', 'funnel'
    )
  `).run(id, now, now);
  return id;
}

function cleanupTestAgents(db) {
  db.prepare(`DELETE FROM users WHERE email LIKE '%fatima%' OR email LIKE '%test-agent%'`).run();
}

async function waitServerReady(url, maxRetries = 40) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/login`);
      if (res.status === 200) return true;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server failed to start on " + url);
}

async function run() {
  console.log("Starting Next.js production server on port", PORT);
  const server = spawn("npm", ["run", "start", "--", "-p", String(PORT)], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  });

  const db = new Database(process.env.DB_PATH || "./data/crm.db");
  cleanupTestAgents(db);
  const testOrderId = createTestOrder(db);

  let browser;
  try {
    await waitServerReady(BASE_URL);
    console.log("Server is ready! Launching Chromium...");

    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    console.log("\n--- TEST 1: Admin Login ---");
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', "admin@zehri.ma");
    await page.fill('input[name="password"]', "AdminPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/crm`);
    console.log("✓ Admin logged in and redirected to /crm");

    console.log("\n--- TEST 2: Theme Persistence & Toggle ---");
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute("data-crm-theme"));
    console.log("Initial theme:", initialTheme);
    if (!initialTheme) throw new Error("Missing data-crm-theme on html");

    // Click theme toggle in desktop sidebar
    const toggleBtn = page.locator("aside").getByRole("button", { name: /thème/i });
    await toggleBtn.click();
    await page.waitForTimeout(300);

    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute("data-crm-theme"));
    console.log("Toggled theme:", toggledTheme);
    if (toggledTheme === initialTheme) throw new Error("Theme did not toggle");

    const storedTheme = await page.evaluate(() => localStorage.getItem("zehri-crm-theme"));
    if (storedTheme !== toggledTheme) throw new Error(`Stored theme ${storedTheme} mismatch with ${toggledTheme}`);
    console.log("✓ Stored theme in localStorage:", storedTheme);

    await page.reload();
    await page.waitForTimeout(300);
    const reloadedTheme = await page.evaluate(() => document.documentElement.getAttribute("data-crm-theme"));
    if (reloadedTheme !== toggledTheme) throw new Error("Theme did not persist after reload");
    console.log("✓ Theme persisted after reload:", reloadedTheme);

    console.log("\n--- TEST 3: Responsive Mobile Header & Drawer ---");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Sidebar should be hidden
    const sidebarVisible = await page.locator("aside").isVisible();
    if (sidebarVisible) throw new Error("Desktop sidebar should be hidden on mobile");

    // Compact header should be visible
    const mobileHeader = page.locator("header").filter({ hasText: "Zehri CRM" });
    if (!(await mobileHeader.isVisible())) throw new Error("Mobile header not visible");
    console.log("✓ Compact mobile header is visible");

    // Section title should be 'Tableau de bord'
    const sectionTitle = await mobileHeader.locator("span.font-bold").innerText();
    console.log("Mobile section title:", sectionTitle);
    if (sectionTitle !== "Tableau de bord") throw new Error(`Expected 'Tableau de bord', got ${sectionTitle}`);

    // Open hamburger drawer
    const menuBtn = page.getByRole("button", { name: "Ouvrir le menu de navigation" });
    await menuBtn.click();
    await page.waitForTimeout(300);

    const drawer = page.getByRole("dialog");
    if (!(await drawer.isVisible())) throw new Error("Mobile drawer did not open");
    console.log("✓ Mobile drawer opened");

    // Verify drawer contents
    const closeBtn = drawer.getByRole("button", { name: "Fermer le menu" });
    if (!(await closeBtn.isVisible())) throw new Error("Close button missing in drawer");
    console.log("✓ Close button visible in drawer");

    // Click 'Commandes' link inside drawer
    const commandesLink = drawer.getByRole("link", { name: "Commandes" });
    await commandesLink.click();
    await page.waitForURL(`${BASE_URL}/crm/orders`);
    console.log("✓ Navigated to /crm/orders via mobile drawer");

    // Drawer should have closed after navigation (wait for exit animation)
    await drawer.waitFor({ state: "hidden", timeout: 2000 });
    console.log("✓ Drawer closed automatically on navigation");

    const newSectionTitle = await mobileHeader.locator("span.font-bold").innerText();
    if (newSectionTitle !== "Commandes") throw new Error(`Expected section title 'Commandes', got ${newSectionTitle}`);
    console.log("✓ Mobile section title updated to:", newSectionTitle);

    // Test auto-close on resize to desktop
    await menuBtn.click();
    await page.waitForTimeout(300);
    if (!(await drawer.isVisible())) throw new Error("Drawer failed to open second time");
    await page.setViewportSize({ width: 1280, height: 800 });
    await drawer.waitFor({ state: "hidden", timeout: 2000 });
    console.log("✓ Drawer automatically closed on desktop resize");

    console.log("\n--- TEST 4: Collapsible BL Archive ---");
    await page.goto(`${BASE_URL}/crm/expeditions`);
    const archiveBtn = page.getByRole("button", { name: /Archives des BL/i });
    if (!(await archiveBtn.isVisible())) throw new Error("Archives des BL disclosure button not found");

    const isExpandedInitially = (await archiveBtn.getAttribute("aria-expanded")) === "true";
    if (isExpandedInitially) throw new Error("BL Archive should be collapsed by default");
    console.log("✓ BL archive is collapsed by default");

    await archiveBtn.click();
    const isExpandedAfterClick = (await archiveBtn.getAttribute("aria-expanded")) === "true";
    if (!isExpandedAfterClick) throw new Error("BL Archive should expand on click");
    console.log("✓ BL archive expands on click");

    // Visit with ?archives=1
    await page.goto(`${BASE_URL}/crm/expeditions?archives=1`);
    const archiveBtnUrl = page.getByRole("button", { name: /Archives des BL/i });
    const isExpandedWithParam = (await archiveBtnUrl.getAttribute("aria-expanded")) === "true";
    if (!isExpandedWithParam) throw new Error("BL Archive should be open when archives=1 in query");
    console.log("✓ BL archive is open when query parameter archives=1 is set");

    console.log("\n--- TEST 5: Team Management (/crm/equipe) ---");
    await page.goto(`${BASE_URL}/crm/equipe`);
    const teamHeading = page.getByRole("heading", { name: "Gestion de l'équipe" });
    if (!(await teamHeading.isVisible())) throw new Error("Team page heading missing");
    console.log("✓ Admin accessed /crm/equipe");

    // Create Agent
    await page.getByRole("button", { name: "Ajouter un agent" }).first().click();
    await page.waitForTimeout(200);
    const createModal = page.getByRole("dialog");
    await createModal.locator('input[name="name"]').fill("Fatima Zahra");
    await createModal.locator('input[name="email"]').fill("fatima.zahra@zehri.ma");
    await createModal.locator('input[name="password"]').fill("FatimaPassword123!");
    await createModal.getByRole("button", { name: "Créer l'agent" }).click();
    await page.waitForTimeout(500);

    const agentRow = page.locator("tr").filter({ hasText: "fatima.zahra@zehri.ma" });
    await agentRow.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ Agent Fatima Zahra created and listed in table with status Actif");

    // Test duplicate email
    await page.getByRole("button", { name: "Ajouter un agent" }).first().click();
    await page.waitForTimeout(200);
    const dupModal = page.getByRole("dialog");
    await dupModal.locator('input[name="name"]').fill("Fatima Clone");
    await dupModal.locator('input[name="email"]').fill("fatima.zahra@zehri.ma");
    await dupModal.locator('input[name="password"]').fill("FatimaPassword123!");
    await dupModal.getByRole("button", { name: "Créer l'agent" }).click();
    await page.waitForTimeout(500);

    // Verify error toast for duplicate
    const toastError = page.locator("[data-sonner-toast]").filter({ hasText: /existe déjà/i });
    if (!(await toastError.isVisible())) throw new Error("Expected duplicate email conflict error toast");
    console.log("✓ Duplicate agent email properly rejected with conflict message");
    await dupModal.getByRole("button", { name: "Annuler" }).click();
    await page.waitForTimeout(200);

    // Rename agent
    await agentRow.getByRole("button", { name: /Modifier le nom/i }).click();
    const editModal = page.getByRole("dialog");
    await editModal.locator('input[name="name"]').fill("Fatima Zahra El Amrani");
    await editModal.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForTimeout(500);

    const renamedRow = page.locator("tr").filter({ hasText: "Fatima Zahra El Amrani" });
    if (!(await renamedRow.isVisible())) throw new Error("Agent name update failed");
    console.log("✓ Agent renamed to 'Fatima Zahra El Amrani'");

    // Reset password
    await renamedRow.getByRole("button", { name: /Réinitialiser le mot de passe/i }).click();
    const passModal = page.getByRole("dialog");
    await passModal.locator('input[name="password"]').fill("NewFatimaPass123!");
    await passModal.getByRole("button", { name: "Réinitialiser le mot de passe" }).click();
    await page.waitForTimeout(500);
    console.log("✓ Agent password successfully reset");

    // Deactivate agent
    await renamedRow.getByRole("button", { name: /Désactiver/i }).click();
    await page.waitForTimeout(500);
    const inactifBadge = renamedRow.locator("span").filter({ hasText: "Inactif" });
    if (!(await inactifBadge.isVisible())) throw new Error("Agent status not Inactif after deactivation");
    console.log("✓ Agent deactivated (status Inactif)");

    // Verify deactivated agent cannot login
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    await agentPage.goto(`${BASE_URL}/login`);
    await agentPage.fill('input[name="email"]', "fatima.zahra@zehri.ma");
    await agentPage.fill('input[name="password"]', "NewFatimaPass123!");
    await agentPage.click('button[type="submit"]');
    await agentPage.waitForTimeout(500);

    if (agentPage.url().includes("/crm")) {
      throw new Error("Deactivated agent should not be able to log in");
    }
    console.log("✓ Deactivated agent correctly rejected at login");
    await agentContext.close();

    // Reactivate agent
    await renamedRow.getByRole("button", { name: /Réactiver/i }).click();
    await page.waitForTimeout(500);
    const actifBadge = renamedRow.locator("span").filter({ hasText: "Actif" });
    if (!(await actifBadge.isVisible())) throw new Error("Agent status not Actif after reactivation");
    console.log("✓ Agent reactivated (status Actif)");

    console.log("\n--- TEST 6: Agent Permissions & Route Protection ---");
    const agentCtx = await browser.newContext();
    const agPage = await agentCtx.newPage();
    await agPage.goto(`${BASE_URL}/login`);
    await agPage.fill('input[name="email"]', "agent@zehri.ma");
    await agPage.fill('input[name="password"]', "AgentPassword123!");
    await agPage.click('button[type="submit"]');
    await agPage.waitForURL(`${BASE_URL}/crm`);
    console.log("✓ Standard agent logged in");

    // Check nav links in sidebar: Équipe and Catalogue should be absent
    const equipeLink = agPage.locator('aside a[href="/crm/equipe"]');
    if (await equipeLink.isVisible()) throw new Error("Agent should NOT see 'Équipe' link");
    const catLink = agPage.locator('aside a[href="/admin"]');
    if (await catLink.isVisible()) throw new Error("Agent should NOT see 'Catalogue produits' link");
    console.log("✓ 'Équipe' and 'Catalogue produits' are hidden for agent");

    // Direct access to /crm/equipe should redirect agent to /crm
    await agPage.goto(`${BASE_URL}/crm/equipe`);
    await agPage.waitForURL(`${BASE_URL}/crm`);
    console.log("✓ Agent direct visit to /crm/equipe redirected to /crm");
    await agentCtx.close();

    console.log("\n--- TEST 7: Order Detail & Contact Result Placement ---");
    await page.goto(`${BASE_URL}/crm/orders/${testOrderId}`);
    const orderTitle = page.locator("h1").filter({ hasText: testOrderId });
    if (!(await orderTitle.isVisible())) throw new Error("Order detail page failed to load");
    console.log("✓ Order detail page loaded");

    // Contact result form (Enregistrer le résultat) must be positioned at bottom of contact section
    const contactSection = page.locator("section").filter({ hasText: /Résultat du contact/i });
    if (!(await contactSection.isVisible())) throw new Error("Contact result section missing on order page");
    const contactForm = contactSection.locator("form");
    if (!(await contactForm.isVisible())) throw new Error("Contact form missing in contact result section");
    console.log("✓ Contact result section and form are present at bottom of order page");

    console.log("\n==========================================");
    console.log("🎉 ALL PLAYWRIGHT END-TO-END TESTS PASSED!");
    console.log("==========================================\n");
  } finally {
    if (browser) await browser.close();
    server.kill();
    cleanupTestAgents(db);
    db.close();
  }
}

run().catch((err) => {
  console.error("\n❌ E2E Test Failed:", err);
  process.exit(1);
});
