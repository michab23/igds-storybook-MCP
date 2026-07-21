import { ZeroheightComponent, ZeroheightData } from '../types.js';

// Mapping from Zeroheight component names to Storybook component names
// This handles naming differences between the two systems
const COMPONENT_NAME_MAP: Record<string, { angular?: string; react?: string; 'core-web'?: string }> = {
  'Button': { angular: 'Button', react: 'Button', 'core-web': 'Button' },
  'Timed Button': { angular: 'Button', react: 'Button', 'core-web': 'Button' },
  'Floating Button': { angular: 'Button', react: 'Button', 'core-web': 'Button' },
  'Split Button': { angular: 'Button', react: 'Button', 'core-web': 'Button' },
  'Check box': { angular: 'Checkbox', react: 'Checkbox', 'core-web': 'Checkbox' },
  'Checkbox': { angular: 'Checkbox', react: 'Checkbox', 'core-web': 'Checkbox' },
  'Toggle (Switch)': { angular: 'Toggle', react: 'Toggle', 'core-web': 'Toggle' },
  'Toggle': { angular: 'Toggle', react: 'Toggle', 'core-web': 'Toggle' },
  'Slider': { angular: 'Slider', react: 'Slider', 'core-web': 'Slider' },
  'Spin Box': { angular: 'SpinBox', react: 'SpinBox', 'core-web': 'SpinBox' },
  'Anchor': { angular: 'Anchor', react: 'Anchor', 'core-web': 'Anchor' },
  'Rating': { angular: 'Rating', react: 'Rating', 'core-web': 'Rating' },
  'Radio Button': { angular: 'Radio', react: 'Radio', 'core-web': 'Radio' },
  'Quick Answers - Chips': { angular: 'Tag', react: 'Tag', 'core-web': 'Tag' },
  'Input field': { angular: 'Input', react: 'Input', 'core-web': 'Input' },
  'Input Field': { angular: 'Input', react: 'Input', 'core-web': 'Input' },
  'Drop down': { angular: 'Dropdown', react: 'Dropdown', 'core-web': 'Dropdown' },
  'Dropdown': { angular: 'Dropdown', react: 'Dropdown', 'core-web': 'Dropdown' },
  'Search field': { angular: 'SearchField', react: 'SearchField', 'core-web': 'SearchField' },
  'SearchField': { angular: 'SearchField', react: 'SearchField', 'core-web': 'SearchField' },
  'Date Picker': { angular: 'DatePicker', react: 'DatePicker', 'core-web': 'DatePicker' },
  'DatePicker': { angular: 'DatePicker', react: 'DatePicker', 'core-web': 'DatePicker' },
  'File Uploader': { angular: 'FileUploader', react: 'FileUploader', 'core-web': 'FileUploader' },
  'Text Area': { angular: 'Textarea', react: 'Textarea', 'core-web': 'Textarea' },
  'Textarea': { angular: 'Textarea', react: 'Textarea', 'core-web': 'Textarea' },
  'Rich Text Editor': { angular: 'RichTextEditor', react: 'RichTextEditor', 'core-web': 'RichTextEditor' },
  'Time Picker': { angular: 'DatePicker', react: 'DatePicker', 'core-web': 'DatePicker' },
  'Profile Picker': { angular: 'ProfilePicker', react: 'ProfilePicker', 'core-web': 'ProfilePicker' },
  'Signature': { angular: 'Input', react: 'Input', 'core-web': 'Input' },
  'Chat Input': { angular: 'Input', react: 'Input', 'core-web': 'Input' },
  'Divider': { angular: 'Divider', react: 'Divider', 'core-web': 'Divider' },
  'Status Badge': { angular: 'Badge', react: 'Badge', 'core-web': 'Badge' },
  'Numeric badge': { angular: 'Badge', react: 'Badge', 'core-web': 'Badge' },
  'Progress bar': { angular: 'ProgressBar', react: 'ProgressBar', 'core-web': 'ProgressBar' },
  'Notification Button': { angular: 'Button', react: 'Button', 'core-web': 'Button' },
  'Tag': { angular: 'Tag', react: 'Tag', 'core-web': 'Tag' },
  'Step indicator': { angular: 'StepIndicator', react: 'StepIndicator', 'core-web': 'StepIndicator' },
  'Scroll': { angular: 'List', react: 'List', 'core-web': 'List' },
  'Skeleton': { angular: 'Skeleton', react: 'Skeleton', 'core-web': 'Skeleton' },
  'Loader': { angular: 'ProgressBar', react: 'ProgressBar', 'core-web': 'ProgressBar' },
  'Accordion': { angular: 'Accordion', react: 'Accordion', 'core-web': 'Accordion' },
  'Card': { angular: 'Card', react: 'Card', 'core-web': 'Card' },
  'Banner': { angular: 'Banner', react: 'Banner', 'core-web': 'Banner' },
  'List': { angular: 'List', react: 'List', 'core-web': 'List' },
  'Updates': { angular: 'Banner', react: 'Banner', 'core-web': 'Banner' },
  'Breadcrumbs': { angular: 'Breadcrumbs', react: 'Breadcrumbs', 'core-web': 'Breadcrumbs' },
  'Top menu': { angular: 'Header', react: 'Header', 'core-web': 'Header' },
  'Side menu': { angular: 'Menu', react: 'Menu', 'core-web': 'Menu' },
  'Contextual menu': { angular: 'PopupMenu', react: 'PopupMenu', 'core-web': 'PopupMenu' },
  'Tabs': { angular: 'Tabs', react: 'Tabs', 'core-web': 'Tabs' },
  'Numeric Pagination': { angular: 'Pagination', react: 'Pagination', 'core-web': 'Pagination' },
  'Unnumbered Pagination': { angular: 'Pagination', react: 'Pagination', 'core-web': 'Pagination' },
  'Toast': { angular: 'Toast', react: 'Toast', 'core-web': 'Toast' },
  'Tooltip': { angular: 'Tooltip', react: 'Tooltip', 'core-web': 'Tooltip' },
  'Modal': { angular: 'Modal', react: 'Modal', 'core-web': 'Modal' },
  'Drawer': { angular: 'Drawer', react: 'Drawer', 'core-web': 'Drawer' },
  'Tour Guide - Spotlight': { angular: 'Modal', react: 'Modal', 'core-web': 'Modal' },
  'Tour Guide - Walkthrough - Modal': { angular: 'Modal', react: 'Modal', 'core-web': 'Modal' },
  'Error Message': { angular: 'Banner', react: 'Banner', 'core-web': 'Banner' },
  'Table': { angular: 'Table', react: 'Table', 'core-web': 'Table' },
  'Filter- Horizontal': { angular: 'Filter', react: 'Filter', 'core-web': 'Filter' },
  'Filter Vertical': { angular: 'Filter', react: 'Filter', 'core-web': 'Filter' },
  'Bottom Navigation': { angular: 'Menu', react: 'Menu', 'core-web': 'Menu' },
  'Top navigation': { angular: 'Header', react: 'Header', 'core-web': 'Header' }
};

export function mapCrossReferences(zhData: ZeroheightData): ZeroheightData {
  for (const [name, component] of Object.entries(zhData.components)) {
    const mapping = COMPONENT_NAME_MAP[name];
    
    if (mapping) {
      component.storybookCrossRef = mapping;
    } else {
      // Try fuzzy matching
      const fuzzyMatch = findFuzzyMatch(name);
      if (fuzzyMatch) {
        component.storybookCrossRef = fuzzyMatch;
      }
    }
  }
  
  return zhData;
}

function findFuzzyMatch(zhName: string): { angular?: string; react?: string; 'core-web'?: string } | undefined {
  const normalizedName = zhName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  for (const [name, mapping] of Object.entries(COMPONENT_NAME_MAP)) {
    const normalizedMapName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (normalizedName.includes(normalizedMapName) || normalizedMapName.includes(normalizedName)) {
      return mapping;
    }
  }
  
  return undefined;
}

export function getStorybookComponentName(zhName: string, framework: 'angular' | 'react' | 'core-web'): string | undefined {
  const mapping = COMPONENT_NAME_MAP[zhName];
  return mapping?.[framework];
}

export function getZeroheightComponentName(storybookName: string): string | undefined {
  for (const [zhName, mapping] of Object.entries(COMPONENT_NAME_MAP)) {
    if (mapping.angular === storybookName || 
        mapping.react === storybookName || 
        mapping['core-web'] === storybookName) {
      return zhName;
    }
  }
  
  return undefined;
}
