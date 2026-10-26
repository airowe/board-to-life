type Attributes = Record<string, string | boolean | ((event: Event) => void)>;
type Child = Node | string | null | false;

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value === 'function') element.addEventListener(name.replace(/^on/, ''), value);
    else if (value === true) element.setAttribute(name, '');
    else if (value !== false) element.setAttribute(name, value);
  }
  for (const child of children) if (child) element.append(child);
  return element;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export const s = (tag: string, attributes: Record<string, string | number> = {}, ...children: Child[]): SVGElement => {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const child of children) if (child) element.append(child);
  return element;
};
