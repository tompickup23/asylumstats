async (page) => {
  // Freeze the sticky header in normal flow so a tall element capture is unobscured.
  await page.addStyleTag({content: '.site-header { position: static !important; } *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }'});
  const slug = new URL(page.url()).pathname.split('/').filter(Boolean).pop();
  for (const [device,width,height] of [['mobile',390,844],['desktop',1440,900]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => document.fonts.ready);
    if (await page.evaluate(() => document.documentElement.scrollWidth-innerWidth) > 2) throw new Error('Page overflow');
    await page.locator('.cost-calc').screenshot({path:'output/playwright/cost-table/'+slug+'-'+device+'.png'});
    await page.getByText('Full sources, exclusions and uncertainty', {exact:true}).click();
    if (await page.evaluate(() => document.documentElement.scrollWidth-innerWidth) > 2) throw new Error('Expanded drawer overflow');
    await page.getByText('Full sources, exclusions and uncertainty', {exact:true}).click();
  }
}
