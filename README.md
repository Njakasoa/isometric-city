# Tana Builder

Custom fork of IsoCity, started from `amilich/isometric-city`, for a deployable isometric city-builder game.

Working title: **Tana Builder**.

The default city seed is an approximate, playable Antananarivo map generated from public data:

- OpenStreetMap through Overpass for roads, rail, water, landuse and building centers.
- Open-Meteo Elevation API for a cached Copernicus DEM GLO-90 altitude layer.

The pipeline converts WGS84 coordinates into the game's 96x96 isometric grid, reduces noisy minor-road/drain data, preserves key Antananarivo landmarks, and stores elevation per tile for terrain tinting.

Regenerate it with:

```bash
npm run generate:antananarivo
```

If Overpass is slow, use previously exported JSON layers:

```bash
npm run generate:antananarivo -- --context-file /path/to/context.json --buildings-file /path/to/buildings.json
```

Use `--refresh` to refresh caches and `--no-elevation` to fall back to the synthetic terrain model.

Map data attribution: © OpenStreetMap contributors, available under the ODbL. See https://www.openstreetmap.org/copyright.
Elevation source: Open-Meteo Elevation API, based on Copernicus DEM GLO-90.

## Upstream

Open-source isometric city and theme park builder built with NextJS, TypeScript, and HTML5 Canvas.

<table>
<tr>
<td width="50%" align="center"><strong>IsoCity</strong></td>
<td width="50%" align="center"><strong>IsoCoaster</strong></td>
</tr>
<tr>
<td><img src="public/readme-image.png" width="100%"></td>
<td><img src="public/readme-coaster.png" width="100%"></td>
</tr>
<tr>
<td align="center">City builder with trains, planes, cars, and pedestrians<br><a href="https://iso-city.com">iso-city.com</a></td>
<td align="center">Theme park builder with roller coasters, rides, and guests<br><a href="https://iso-coaster.com">iso-coaster.com</a></td>
</tr>
</table>

Made with [Cursor](https://cursor.com).

## Features

-   **Isometric Rendering Engine**: Rendering with HTML5 Canvas (`CanvasIsometricGrid`) capable of handling complex depth sorting, layer management, and both image and canvas sprites.
-   **Dynamic Simulation**:
    -   **Traffic System**: Autonomous vehicles including cars, trains, planes, buses, and seaplanes.
    -   **Trains, bridges, buses, barges, and more**: Vehicles will navigate throughout your city and respect traffic lights.
    -   **Pedestrian System**: Pathfinding and crowd simulation for city inhabitants.
    -   **Economy & Resources**: Resource management, zoning (Residential, Commercial, Industrial), and city growth logic.
-   **Interactive Grid**: Tile-based placement system for buildings, roads, rail, parks, utilities, and more.
-   **State Management**: Save and load functionality for multiple cities.
-   **Responsive Design**: Mobile-friendly interface with touch friendly controls, drawers, and toolbars.

## Tech Stack

-   **Framework**: [Next.js 16](https://nextjs.org/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Graphics**: HTML5 Canvas (No external game engine libraries; pure native implementation).
-   **Icons**: Lucide React.

## Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/amilich/isometric-city.git
    cd isometric-city
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```

4.  **Open the game**
    Visit [http://localhost:3000](http://localhost:3000) to play IsoCity. 
    Visit [http://localhost:3000/coaster](http://localhost:3000/coaster) for IsoCoaster.

## Contributing

Contributions, bug reports, and feature requests are welcome.

## License

Distributed under the MIT License. See `LICENSE` for more information.
