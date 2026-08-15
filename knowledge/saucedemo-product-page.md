# SauceDemo: single product page

## Product page and its selectors

Reached at `/inventory-item.html?id=N` by clicking a product name on the inventory page.

| Element          | Selector                             |
| ---------------- | ------------------------------------ |
| Name             | `[data-test="inventory-item-name"]`  |
| Description      | `[data-test="inventory-item-desc"]`  |
| Price            | `[data-test="inventory-item-price"]` |
| Remove button    | `[data-test="remove"]`               |
| Back to products | `[data-test="back-to-products"]`     |

Page object: `tests/support/pages/product.page.ts` (`ProductPage`).

## The add button has no stable data-test id

On this page the add button is matched by role and accessible name,
`page.getByRole('button', { name: /add to cart/i })`, because its `data-test` value
depends on the cart state rather than staying constant.

`cartToggleButton` matches whichever of the two buttons is currently rendered,
`[data-test="add-to-cart"], [data-test="remove"]`. Use it when the assertion is about
the toggle changing, not about a specific state.

## Reaching this page

Always arrive by clicking a product name from the inventory list, through
`InventoryPage.openProduct(name)`. Navigating straight to `/inventory-item.html?id=4`
ties the test to an internal id and skips the navigation being tested; the quality gate
rejects it.
