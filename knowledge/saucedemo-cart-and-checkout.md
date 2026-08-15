# SauceDemo: cart and checkout

## Cart page

Reached at `/cart.html`, from the inventory page via `openCart()` (the cart link).

| Element           | Selector                             |
| ----------------- | ------------------------------------ |
| Item name         | `[data-test="inventory-item-name"]`  |
| Item price        | `[data-test="inventory-item-price"]` |
| Checkout button   | `[data-test="checkout"]`             |
| Continue shopping | `[data-test="continue-shopping"]`    |

Page object: `tests/support/pages/cart.page.ts` (`CartPage`), with `removeFromCart(name)`
and `checkout()`. The remove button here uses the same name slug as on the inventory page.

## Checkout is three screens, not one

1. **Customer information**, `/checkout-step-one.html`: first name, last name, postal code.
2. **Overview**, `/checkout-step-two.html`: the items plus the price summary.
3. **Confirmation**, `/checkout-complete.html`: the thank-you message.

One page object covers all three: `tests/support/pages/checkout.page.ts` (`CheckoutPage`).

## Checkout selectors

| Element             | Selector                         |
| ------------------- | -------------------------------- |
| First name          | `[data-test="firstName"]`        |
| Last name           | `[data-test="lastName"]`         |
| Postal code         | `[data-test="postalCode"]`       |
| Continue button     | `[data-test="continue"]`         |
| Finish button       | `[data-test="finish"]`           |
| Subtotal label      | `[data-test="subtotal-label"]`   |
| Tax label           | `[data-test="tax-label"]`        |
| Total label         | `[data-test="total-label"]`      |
| Confirmation header | `[data-test="complete-header"]`  |
| Back to products    | `[data-test="back-to-products"]` |

Note the camelCase on the three form fields. They are the only camelCase `data-test`
values on the site; everything else is kebab-case.

## Filling the form

`fillCustomerInfo(first, last, zip)` fills all three fields and presses continue. It
defaults to `John`, `Doe`, `12345`, so a spec that does not care about the values calls
it with no arguments. These are form inputs, not credentials, so literal values here are
fine.

## Price summary

`totals()` returns `{ subtotal, tax, total }` as numbers, parsed out of the labels. That
makes an arithmetic assertion possible: the total equals the subtotal plus the tax, and
the subtotal equals the sum of the item prices. Asserting on the formatted strings
instead would be a weaker test that breaks on currency formatting.

## Confirmation

After `finish()` the URL is `/checkout-complete.html` and `[data-test="complete-header"]`
carries the thank-you text. The cart empties at this point, so the cart badge disappears:
`await expect(inventoryPage.cartBadge).toHaveCount(0)` is a good closing assertion for a
full order flow.
