/**
 * tests/support/mutate.ts
 * ---------------------------------------------------------------------------
 * Turn one page-object action into a no-op, so a test can be asked to prove it
 * fails.
 *
 * Green is easy to fake; failing on demand is not. A spec that still passes
 * when the action it exercises never happens is not testing that action, and
 * no amount of reading the spec tells you which case you have. Breaking the
 * action and watching does.
 *
 * Driven by MUTATE_METHOD=ClassName.method, set by scripts/mutation-check.ts.
 * With the variable unset this module costs the normal run one comparison and
 * changes nothing.
 * ---------------------------------------------------------------------------
 */
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';
import { ProductPage } from './pages/product.page';

type Patchable = { prototype: Record<string, unknown> };

const PAGE_OBJECTS = {
  CartPage,
  CheckoutPage,
  InventoryPage,
  LoginPage,
  ProductPage,
} as unknown as Record<string, Patchable>;

/**
 * Replace the named method with an async no-op.
 *
 * Every failure here throws rather than skipping quietly. A typo in the method
 * name would otherwise make every spec fail for the wrong reason, and the
 * harness would read that as "the test correctly fails" and hand out a clean
 * bill of health it never earned. A harness that can be wrong in the reassuring
 * direction is worse than none.
 */
export function applyMutation(): void {
  const target = process.env.MUTATE_METHOD;
  if (!target) return;

  const [className, methodName] = target.split('.');
  const pageObject = PAGE_OBJECTS[className ?? ''];
  if (!pageObject) {
    throw new Error(`MUTATE_METHOD names an unknown page object: ${target}`);
  }
  if (typeof pageObject.prototype[methodName ?? ''] !== 'function') {
    throw new Error(`MUTATE_METHOD names an unknown method: ${target}`);
  }

  pageObject.prototype[methodName] = async (): Promise<void> => {
    /* the whole point: this action does not happen */
  };
}
