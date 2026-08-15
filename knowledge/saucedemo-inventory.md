# SauceDemo: inventory (product list)

## Inventory page and its selectors

Reached at `/inventory.html` after a successful login. This is the product list.

| Element            | Selector                               |
| ------------------ | -------------------------------------- |
| Product name       | `[data-test="inventory-item-name"]`    |
| Product price      | `[data-test="inventory-item-price"]`   |
| Cart badge (count) | `[data-test="shopping-cart-badge"]`    |
| Cart link          | `[data-test="shopping-cart-link"]`     |
| Sort dropdown      | `[data-test="product-sort-container"]` |

Page object: `tests/support/pages/inventory.page.ts` (`InventoryPage`).

## Add and remove buttons are name-derived

The add and remove buttons carry the product name as a slug:
"Sauce Labs Backpack" becomes `sauce-labs-backpack`, so the buttons are
`[data-test="add-to-cart-sauce-labs-backpack"]` and
`[data-test="remove-sauce-labs-backpack"]`.

Do not build this string in a spec. `InventoryPage` already does it:
`addToCart('Sauce Labs Backpack')` and `removeFromCart('Sauce Labs Backpack')`.

## Cart badge behaviour

The badge `[data-test="shopping-cart-badge"]` does not exist when the cart is empty.
It appears with the count once the first product is added, and disappears again when
the cart is emptied. So "the cart is empty" is asserted with
`await expect(inventoryPage.cartBadge).toHaveCount(0)`, not with a text comparison
against zero.

## Sorting

`sortBy(value)` selects an option on the dropdown. The four option values are
`az` (name A to Z), `za` (name Z to A), `lohi` (price low to high) and
`hilo` (price high to low).

`prices()` returns the visible prices as numbers, in display order, so a sort check is
an assertion on that array being ordered rather than a comparison of text labels.

## Opening a product

`openProduct('Sauce Labs Backpack')` filters the product names by text and clicks the
match. Do not click by index: the list order changes with sorting, so an index-based
click passes for the wrong reason.
