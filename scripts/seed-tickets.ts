/**
 * One-off setup script: writes detailed descriptions to the AIQA demo tickets.
 * Run once after creating the Jira project and tickets:
 *   npx tsx scripts/seed-tickets.ts
 *
 * It uses setDescription (overwrite) on purpose. This is seeding during setup,
 * not the agent workflow (the agent only appends, never overwrites).
 */
import { setDescription } from '../src/jira';

const tickets: Record<string, string> = {
  'AIQA-1': `Test case: Login with standard_user lands on the inventory page.

Steps:
1. Open the SauceDemo login page (/).
2. Enter username standard_user and password secret_sauce, then click Login.
3. Verify the URL is /inventory.html.
4. Verify the products list (inventory container) is visible.

Expected: the user is authenticated and the inventory page is displayed.`,

  'AIQA-2': `Test case: Adding a product updates the cart badge count.

Steps:
1. Log in as standard_user.
2. On the inventory page, click Add to cart for one product.
3. Verify the cart icon badge shows 1.

Expected: the shopping cart badge reflects the number of added items.`,

  'AIQA-3': `Test case: Full checkout flow reaches the order confirmation page.

Steps:
1. Log in as standard_user.
2. Add a product to the cart and open the cart.
3. Click Checkout and fill First Name, Last Name, and Zip/Postal Code.
4. Click Continue, then Finish.
5. Verify the confirmation message "Thank you for your order!".

Expected: the order is completed and the confirmation page is shown.`,
};

async function main(): Promise<void> {
  for (const [key, desc] of Object.entries(tickets)) {
    await setDescription(key, desc);
    console.log(`seeded ${key}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
