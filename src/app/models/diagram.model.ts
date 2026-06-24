export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// Base interface for elements that can have notes
export interface HasNotes {
  notes: string;
}

// Base class for all diagram elements
export interface DiagramElement extends HasNotes {
  id: string;
  label: string;
  position: Position;
  size: Size;
  attributes: { [key: string]: any };
  innerDiagram?: Diagram;
  rotation?: number;
  groupId?: string;
}

export type NodeShape = 'rectangle' | 'circle' | 'pill' | 'cylinder' | 'diamond' | 'parallelogram' | 'document' | 'roundedRectangle' | 'hexagon' | 'triangle' | 'trapezoid' | 'text' | 'stickman' | 'callout' | 'process' | 'tape' | 'wall' | 'note' | 'verticalLine' | 'horizontalLine' | 'cloud' | 'envelope' | 'cache' | 'tick' | 'cross' | 'lightning' | 'padlock' | 'dataLake' | 'browser' | 'mobile' | 'bar' | 'crcCard' | 'package' | 'component' | 'interface' | 'queue' | 'serverRack' | 'lambda' | 'star' | 'octagon' | 'user' | 'shield' | 'key' | 'gear' | 'dbCluster' | 'pod' | 'msgTopic' | 'hardDrive' | 'terminal' | 'bell' | 'threatTable' | 'container' | 'hourglass';

export interface CrcCardAttribute {
  name: string;
  description: string;
}

export interface CrcCardResponsibility {
  name: string;
  collaborator: string;
}

export interface CrcCardData {
  className: string;
  superClasses: string[];
  subClasses: string[];
  description: string;
  attributes: CrcCardAttribute[];
  responsibilities: CrcCardResponsibility[];
}

export interface ThreatTableRow {
  col1: string;
  col2: string;
}

export interface ThreatTableData {
  title: string;
  col1Header: string;
  col2Header: string;
  collapsed: boolean;
  rows: ThreatTableRow[];
}

export interface Node extends DiagramElement {
  shape: NodeShape;
  borderColor: string;
  fillColor: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  innerDiagram?: Diagram;
  dotted: boolean;
  strokeWidth?: number;
  layered?: boolean;
  rounded?: boolean;
  locked?: boolean;
  brickWall?: boolean;
}

export interface Connector extends HasNotes {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  name?: string;
  borderColor?: string;
  strokeWidth?: number;
  dotted?: boolean;
  startArrow?: boolean | 'none' | 'arrow' | 'solid';
  endArrow?: boolean | 'none' | 'arrow' | 'solid';
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  attributes: { [key: string]: any };
}

export interface BoundingBox extends DiagramElement {
  fillColor: string;
  borderColor: string;
  rounded: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  strokeWidth?: number;
}

export interface SvgImage extends DiagramElement {
  svgContent: string;
  fileName: string;
  layered?: boolean;
  borderColor?: string;
  strokeWidth?: number;
}

export interface Group {
  id: string;
  elementIds: string[];
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Diagram {
  id: string;
  name: string;
  elements: DiagramElement[];
  connectors: Connector[];
  boundingBoxes: BoundingBox[];
  groups: Group[];
  attributes: { [key: string]: any };
  todos: TodoItem[];
}

// Type guards
export function isNode(element: DiagramElement): element is Node {
  return 'shape' in element && 'fillColor' in element;
}

export function isBoundingBox(element: any): element is BoundingBox {
  return element && 'rounded' in element && 'fillColor' in element;
}

export function isSvgImage(element: DiagramElement): element is SvgImage {
  return 'svgContent' in element && 'fileName' in element;
}

export interface DiagramState {
  currentDiagram: Diagram;
  diagramStack: Diagram[]; // for navigation history
  viewportCenter: Position;
  selectedNodeIds: string[]; // Support multiple selections
  selectedBoundingBoxIds: string[]; // Support multiple selections
  selectedSvgImageIds: string[]; // Support multiple selections
  selectedConnectorIds: string[]; // Support multiple selections
  // Computed properties for backward compatibility
  selectedNodeId?: string;
  selectedBoundingBoxId?: string;
  selectedSvgImageId?: string;
  selectedConnectorId?: string;
  viewSvgContent?: string;
  viewSvgFileName?: string;
}
