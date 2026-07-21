async function check() {
  const r = await fetch('https://igds.gov.il/4988d5140/p/176702-designers');
  const h = await r.text();
  
  // Find all internal links
  const linkPattern = /href="([^"]*igds\.gov\.il[^"]*)"/g;
  const links = new Set();
  let m;
  while ((m = linkPattern.exec(h)) !== null) {
    links.add(m[1]);
  }
  
  console.log('IGDS links found:', links.size);
  for (const l of links) {
    console.log(' ', l);
  }
  
  // Also check for zeroheight-specific content
  const zhPattern = /data-page-section-id="([^"]+)"/g;
  const sections = [];
  while ((m = zhPattern.exec(h)) !== null) {
    sections.push(m[1]);
  }
  console.log('\nZeroheight sections:', sections.length);
}
check();
