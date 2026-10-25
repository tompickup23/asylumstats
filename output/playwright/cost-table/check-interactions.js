async (page) => {
  const rows = page.locator('[data-cost-row]');
  if (await rows.count() !== 361) throw new Error('Missing areas');
  for (const key of ['supported', 'subtotal', 'hotel', 'burden']) {
    await page.locator('#cost-sort').selectOption(key);
    for (const order of ['asc', 'desc']) {
      await page.locator('#cost-order').selectOption(order);
      const values = await rows.evaluateAll((rs, k) => rs.map(r => r.getAttribute('data-' + k)), key);
      let missing = false, previous = null;
      for (const value of values) {
        if (value === '') { missing = true; continue; }
        if (missing) throw new Error('Null sorted as a number');
        const current = Number(value);
        if (previous !== null && (order === 'asc' ? current < previous : current > previous)) throw new Error('Incorrect sort');
        previous = current;
      }
    }
  }
  for (const name of ['Burnley', 'Hillingdon', 'Braintree', 'Glasgow City', 'Torbay']) {
    await page.locator('#cost-search').fill(name);
    if (await page.locator('[data-cost-row]:not([hidden])').count() !== 1) throw new Error('Search failed: ' + name);
  }
  await page.locator('#cost-search').fill('does not exist');
  if (await page.locator('[data-cost-row]:not([hidden])').count() !== 0) throw new Error('Empty search failed');
  await page.locator('#cost-search').fill('');
  await page.locator('#cost-sort').selectOption('name');
  console.log('PASS: all 8 numeric sort directions, nulls last, 5 area searches, empty search and reset');
}
