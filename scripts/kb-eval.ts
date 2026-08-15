/**
 * scripts/kb-eval.ts
 * ---------------------------------------------------------------------------
 * Does hybrid retrieval actually beat BM25 on this knowledge base?
 *
 *   npm run kb:eval
 *
 * The question is not rhetorical. Embeddings cost an optional native dependency
 * with open advisories, and the corpus here is small and written in controlled
 * vocabulary, which is exactly where a lexical baseline is hard to beat. If the
 * numbers say the model does not earn its place, the honest outcome is to drop
 * it and write down why.
 *
 * The queries are deliberately phrased the way a ticket would put it, in
 * everyday words, rather than echoing the wording of the section that answers
 * them. Reusing the section's own vocabulary would measure nothing except that
 * exact match works.
 *
 * Several questions have more than one section that genuinely answers them, so
 * ground truth is a set. Pretending there is exactly one right answer would
 * punish a retriever for being right in a way the author did not anticipate.
 * ---------------------------------------------------------------------------
 */
import { loadChunks } from '../src/knowledge';
import { type Mode, retrieve } from '../src/retrieval';

interface Case {
  query: string;
  /** Any of these counts as correct. */
  accept: string[];
}

/**
 * The other half of the picture.
 *
 * An agent does not only paraphrase. Half its questions carry the exact tokens
 * out of a ticket or out of the code it is writing: attribute names, method
 * names, option values. Measuring only the paraphrase set would stack the deck
 * against lexical search and produce a confident wrong conclusion.
 */
const TECHNICAL_CASES: Case[] = [
  {
    query: 'which selector is the login button',
    accept: ['saucedemo-login.md#login-form-and-its-selectors'],
  },
  {
    query: 'data-test for the checkout finish button',
    accept: ['saucedemo-cart-and-checkout.md#checkout-selectors'],
  },
  {
    query: 'cart badge toHaveCount when the cart is empty',
    accept: ['saucedemo-inventory.md#cart-badge-behaviour'],
  },
  {
    query: 'sortBy option values lohi and hilo',
    accept: ['saucedemo-inventory.md#sorting'],
  },
  {
    query: 'fillCustomerInfo default values',
    accept: ['saucedemo-cart-and-checkout.md#filling-the-form'],
  },
  {
    query: 'complete-header thank you for your order',
    accept: ['saucedemo-cart-and-checkout.md#confirmation'],
  },
  {
    query: 'add-to-cart slug built from the product name',
    accept: ['saucedemo-inventory.md#add-and-remove-buttons-are-name-derived'],
  },
  {
    query: 'import test and expect from support fixtures',
    accept: ['project-conventions.md#page-objects-and-fixtures-are-mandatory'],
  },
  {
    query: 'is waitForTimeout allowed',
    accept: [
      'project-conventions.md#waiting',
      'project-conventions.md#what-the-quality-gate-rejects',
    ],
  },
  {
    query: 'inventory-item-desc selector',
    accept: ['saucedemo-product-page.md#product-page-and-its-selectors'],
  },
];

const CASES: Case[] = [
  {
    query: 'the shopper should end up on the products list after signing in',
    accept: ['saucedemo-login.md#successful-login'],
  },
  {
    query: 'how do I know nothing is in the basket',
    accept: ['saucedemo-inventory.md#cart-badge-behaviour'],
  },
  {
    query: 'arrange the goods cheapest first',
    accept: ['saucedemo-inventory.md#sorting'],
  },
  {
    query: 'what does the shopper type to identify themselves',
    accept: ['saucedemo-login.md#login-form-and-its-selectors'],
  },
  {
    query: 'where does the shopper enter their address details',
    accept: ['saucedemo-cart-and-checkout.md#checkout-selectors'],
  },
  {
    query: 'confirm the purchase actually went through',
    accept: ['saucedemo-cart-and-checkout.md#confirmation'],
  },
  {
    query: 'check that the sums add up',
    accept: ['saucedemo-cart-and-checkout.md#price-summary'],
  },
  {
    query: 'a bad password should show a warning',
    accept: ['saucedemo-login.md#failed-login'],
  },
  {
    query: 'open a single item to see more about it',
    accept: [
      'saucedemo-product-page.md#product-page-and-its-selectors',
      'saucedemo-inventory.md#opening-a-product',
      'saucedemo-product-page.md#reaching-this-page',
    ],
  },
  {
    query: 'am I allowed to pause for two seconds',
    accept: ['project-conventions.md#waiting'],
  },
  {
    query: 'which import belongs at the top of a spec',
    accept: ['project-conventions.md#page-objects-and-fixtures-are-mandatory'],
  },
  {
    query: 'where should the account name and secret come from',
    accept: ['saucedemo-login.md#credentials', 'project-conventions.md#credentials'],
  },
  {
    query: 'the buy button changes depending on which article',
    accept: ['saucedemo-inventory.md#add-and-remove-buttons-are-name-derived'],
  },
  {
    query: 'move the shopper from the basket towards paying',
    accept: ['saucedemo-cart-and-checkout.md#cart-page'],
  },
  {
    query: 'why was my css class selector refused',
    accept: [
      'project-conventions.md#what-the-quality-gate-rejects',
      'project-conventions.md#selector-preference-order',
    ],
  },
];

interface Score {
  mode: Mode;
  recallAt1: number;
  recallAt3: number;
  /** Mean reciprocal rank over the top three, the usual companion to recall. */
  mrr: number;
  misses: string[];
}

async function evaluate(mode: Mode, cases: Case[]): Promise<Score> {
  const chunks = loadChunks();
  let hitsAt1 = 0;
  let hitsAt3 = 0;
  let reciprocal = 0;
  const misses: string[] = [];
  let actualMode: Mode = mode;

  for (const testCase of cases) {
    const { hits, mode: used } = await retrieve(testCase.query, { limit: 3, mode, chunks });
    actualMode = used;

    const ids = hits.map((h) => h.chunk.id);
    const rank = ids.findIndex((id) => testCase.accept.includes(id));

    if (rank === 0) hitsAt1 += 1;
    if (rank >= 0) {
      hitsAt3 += 1;
      reciprocal += 1 / (rank + 1);
    } else {
      misses.push(`${testCase.query}  ->  got ${ids[0] ?? '(nothing)'}`);
    }
  }

  return {
    mode: actualMode,
    recallAt1: hitsAt1 / cases.length,
    recallAt3: hitsAt3 / cases.length,
    mrr: reciprocal / cases.length,
    misses,
  };
}

const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;

const LABEL: Record<Mode, string> = {
  bm25: 'BM25 only',
  semantic: 'Embeddings only',
  hybrid: 'Hybrid (fused on rank)',
};

async function suite(name: string, cases: Case[]): Promise<Score[]> {
  const scores = [
    await evaluate('bm25', cases),
    await evaluate('semantic', cases),
    await evaluate('hybrid', cases),
  ];

  console.log(`\n### ${name} (${cases.length} queries)\n`);
  console.log('| Retrieval | recall@1 | recall@3 | MRR |');
  console.log('| --------- | -------- | -------- | --- |');
  for (const score of scores) {
    console.log(
      `| ${LABEL[score.mode]} | ${percent(score.recallAt1)} | ` +
        `${percent(score.recallAt3)} | ${score.mrr.toFixed(3)} |`,
    );
  }

  return scores;
}

async function main(): Promise<void> {
  const paraphrase = await suite('Paraphrased, everyday wording', CASES);
  const technical = await suite('Technical wording, exact tokens', TECHNICAL_CASES);

  if (paraphrase[1].mode === 'bm25') {
    console.log(
      '\nThe embedding model was not available, so every row is the same run.' +
        '\nInstall it with: npm install --include=optional && npm run kb:index',
    );
    return;
  }

  // The combined view is what the decision rests on: a mode that wins one suite
  // and loses the other has not earned the default.
  console.log('\n### Both suites together\n');
  console.log('| Retrieval | recall@3 | MRR |');
  console.log('| --------- | -------- | --- |');
  const total = CASES.length + TECHNICAL_CASES.length;
  for (let i = 0; i < 3; i += 1) {
    const recall =
      (paraphrase[i].recallAt3 * CASES.length + technical[i].recallAt3 * TECHNICAL_CASES.length) /
      total;
    const mrr =
      (paraphrase[i].mrr * CASES.length + technical[i].mrr * TECHNICAL_CASES.length) / total;
    console.log(`| ${LABEL[paraphrase[i].mode]} | ${percent(recall)} | ${mrr.toFixed(3)} |`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
