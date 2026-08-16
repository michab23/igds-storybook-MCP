import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ZeroheightComponent, ZeroheightPage, ZeroheightData } from './types.js';

const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'zeroheight-data.json');

export class ZeroheightLoader {
  private data: ZeroheightData | null = null;

  isAvailable(): boolean {
    return existsSync(DATA_FILE);
  }

  load(): ZeroheightData {
    if (this.data) {
      return this.data;
    }

    if (!this.isAvailable()) {
      throw new Error('No Zeroheight data found. Run "npm run scrape" first.');
    }

    const raw = readFileSync(DATA_FILE, 'utf-8');
    this.data = JSON.parse(raw) as ZeroheightData;
    return this.data;
  }

  listCategories(): string[] {
    const data = this.load();
    return data.categories;
  }

  listComponents(category?: string): ZeroheightComponent[] {
    const data = this.load();
    const components = Object.values(data.components);
    
    if (category) {
      return components.filter(c => c.category === category);
    }
    
    return components;
  }

  getComponent(name: string): ZeroheightComponent | undefined {
    const data = this.load();
    return data.components[name];
  }

  getComponentSection(
    name: string, 
    section: 'design' | 'code' | 'usage' | 'accessibility'
  ) {
    const component = this.getComponent(name);
    if (!component) return undefined;
    return component.sections[section];
  }

  searchComponents(query: string): ZeroheightComponent[] {
    const data = this.load();
    const lowerQuery = query.toLowerCase();
    
    return Object.values(data.components).filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      c.category.toLowerCase().includes(lowerQuery) ||
      Object.values(c.sections).some(s => 
        s?.content.toLowerCase().includes(lowerQuery)
      )
    );
  }

  getStorybookRef(name: string): Record<string, string> | undefined {
    const component = this.getComponent(name);
    return component?.storybookCrossRef;
  }

  findComponentByStorybookName(
    storybookName: string, 
    framework: 'angular' | 'react' | 'core-web'
  ): ZeroheightComponent | undefined {
    const data = this.load();
    
    return Object.values(data.components).find(c => 
      c.storybookCrossRef?.[framework] === storybookName
    );
  }

  getPage(name: string): ZeroheightPage | undefined {
    const data = this.load();
    return data.pages[name];
  }

  listPages(): ZeroheightPage[] {
    const data = this.load();
    return Object.values(data.pages);
  }

  getStats(): { components: number; pages: number; categories: number; images: number } {
    const data = this.load();
    
    let totalImages = 0;
    for (const component of Object.values(data.components)) {
      for (const section of Object.values(component.sections)) {
        totalImages += section?.images?.length || 0;
      }
    }
    
    return {
      components: Object.keys(data.components).length,
      pages: Object.keys(data.pages).length,
      categories: data.categories.length,
      images: totalImages
    };
  }

  getScrapedAt(): string {
    const data = this.load();
    return data.scrapedAt;
  }
}
