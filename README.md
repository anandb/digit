# 🎨 Digit - Advanced Hierarchical Diagram Editor

[![Angular](https://img.shields.io/badge/Angular-19.2.0-red.svg)](https://angular.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.2-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Digit** is a powerful, web-based diagram editor that revolutionizes the way you create and manage complex hierarchical diagrams. Built with modern web technologies, it offers an intuitive interface for creating interconnected node-based diagrams with unlimited nesting capabilities.

![Digit Diagram Editor](https://via.placeholder.com/800x400/4a90e2/ffffff?text=Digit+Diagram+Editor)

## ✨ Key Features

### 🏗️ Hierarchical Diagram Creation
- **Nested Diagrams**: Create diagrams within diagrams with unlimited depth
- **Hierarchical Navigation**: Seamlessly navigate between parent and child diagrams
- **Visual Hierarchy**: Clear visual indicators for nested relationships

### 🔗 Advanced Connection System
- **Tendrils**: Dynamic connection points that can be positioned anywhere on element borders
- **Live Edge Routing**: Edges automatically update as you move tendrils
- **Smart Snapping**: Tendrils snap to element borders for precise positioning
- **Connection Types**: Support for incoming and outgoing connections

### 🎯 Rich Element Library
- **Multiple Shapes**: Rectangle, Circle, Diamond, Triangle, Hexagon, Parallelogram, Trapezoid, Pill, Process, Note, Callout, Cube, Tape, and more
- **SVG Image Support**: Import and integrate SVG graphics directly into diagrams
- **Custom Styling**: Full control over colors, borders, and visual properties
- **Bounding Boxes**: Group related elements with customizable containers

### 🎨 Professional Visual Features
- **Custom Colors**: Choose from predefined palettes or custom colors
- **Border Styles**: Solid and dotted border options
- **Responsive Design**: Adapts to different screen sizes
- **High-Performance Rendering**: Smooth animations and interactions

### ⚡ Powerful Editing Capabilities
- **Multi-Selection**: Select and manipulate multiple elements simultaneously
- **Undo/Redo**: Full undo history with 50-step buffer
- **Drag & Drop**: Intuitive element positioning and tendril placement
- **Real-time Updates**: Live preview of changes as you edit

### 💾 Data Management
- **JSON Export/Import**: Save and load diagrams in standard JSON format
- **Persistent State**: Automatic saving of sidebar preferences
- **Cross-Session Continuity**: Resume work exactly where you left off

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/anandb/digit.git
   cd digit
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   # or
   ng serve
   ```

4. **Open your browser**
   Navigate to `http://localhost:4200/`

The application will automatically reload when you make changes to the source code.

## 📖 User Guide

### Creating Your First Diagram

1. **Add Elements**: Click on shape buttons in the toolbar to add nodes to the canvas
2. **Position Elements**: Drag elements around the canvas to arrange your diagram
3. **Create Connections**: Hold Ctrl and click on tendrils to create edges between elements
4. **Customize Appearance**: Use the property panels to change colors, labels, and styles

### Working with Tendrils

Tendrils are the connection points on your diagram elements:

- **Adding Tendrils**: Right-click on an element and select "Add Tendril"
- **Moving Tendrils**: Click and drag tendrils to reposition them on element borders
- **Creating Edges**: Hold Ctrl while clicking tendrils to create connections
- **Edge Labels**: Add names to edges for better documentation

### Hierarchical Diagrams

Digit supports unlimited nesting levels:

1. **Create Inner Diagram**: Double-click on any node to enter its inner diagram
2. **Navigate Hierarchy**: Use the breadcrumb navigation or back button
3. **Exposed Tendrils**: Mark tendrils as "exposed" to make them visible in parent diagrams
4. **Propagated Connections**: Connect to inner diagram tendrils from parent levels

### Advanced Features

#### Multi-Selection
- Hold Ctrl/Cmd while clicking to select multiple elements
- Selected elements can be moved, styled, or deleted together

#### SVG Integration
- Drag and drop SVG files onto the canvas
- SVGs are automatically scaled and integrated as diagram elements
- Full support for SVG tendrils and connections

#### Keyboard Shortcuts
- `Ctrl+Z`: Undo last action
- `Ctrl+S`: Save diagram
- `Delete`: Remove selected elements
- `Ctrl+Click`: Multi-select or create edges

## 🏛️ Architecture

### Core Components

```
src/
├── app/
│   ├── components/
│   │   ├── diagram-canvas/          # Main canvas component
│   │   └── diagram-toolbar/         # Sidebar with tools
│   ├── models/
│   │   └── diagram.model.ts         # TypeScript interfaces
│   ├── services/
│   │   └── diagram.service.ts       # State management
│   └── app.component.ts             # Root component
```

### Key Technologies

- **Angular 19**: Modern reactive framework
- **TypeScript**: Type-safe development
- **RxJS**: Reactive programming for state management
- **SVG**: Scalable vector graphics for crisp rendering
- **Angular CDK**: Component development kit for drag-and-drop

### State Management

Digit uses a centralized state management approach:

- **DiagramService**: Manages all diagram state and operations
- **Reactive Updates**: Real-time UI updates via RxJS observables
- **Undo System**: 50-step undo buffer per diagram
- **Hierarchical State**: Maintains state across nested diagrams

## 🎨 Customization

### Adding New Shapes

To add custom shapes, modify `diagram-canvas.component.ts`:

```typescript
// Add new shape calculation method
getCustomShapePoints(node: any): string {
  // Return SVG path data for your custom shape
  return `M 0 0 L ${node.size.width} 0 L ${node.size.width} ${node.size.height} Z`;
}
```

### Extending Tendril Behavior

Customize tendril positioning and behavior in the service layer:

```typescript
// Override tendril positioning logic
updateTendril(elementId: string, tendrilId: string, updates: Partial<Tendril>): void {
  // Custom positioning logic here
}
```

## 🔧 Development

### Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/digit/` directory.

### Running Tests

```bash
npm test
```

### Code Scaffolding

Generate new components:

```bash
ng generate component component-name
ng generate service service-name
ng generate guard guard-name
```

### Project Structure

```
digit/
├── src/
│   ├── app/
│   │   ├── components/           # UI components
│   │   ├── models/              # TypeScript interfaces
│   │   ├── services/            # Business logic
│   │   └── styles/              # Global styles
│   ├── assets/                  # Static assets
│   └── environments/            # Environment configs
├── dist/                        # Build output
├── node_modules/                # Dependencies
└── angular.json                 # Angular configuration
```

## 🌟 Advanced Use Cases

### System Architecture Diagrams
Create detailed system architectures with nested components, showing data flow and dependencies.

### Flowchart Design
Build complex business process flows with conditional logic and decision points.

### Network Topology
Map network infrastructure with hierarchical views of subnets, devices, and connections.

### Data Flow Diagrams
Visualize data transformations and processing pipelines across multiple levels.

### Organizational Charts
Design organizational structures with reporting relationships and team hierarchies.

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow Angular style guide
- Write comprehensive tests
- Update documentation
- Maintain TypeScript strict mode
- Use semantic commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Angular team for the excellent framework
- Open source community for inspiration and tools
- Contributors who help improve Digit

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/anandb/digit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/anandb/digit/discussions)
- **Documentation**: [Wiki](https://github.com/anandb/digit/wiki)

---

**Made with ❤️ using Angular and TypeScript**

*Digit - Where ideas connect visually*
