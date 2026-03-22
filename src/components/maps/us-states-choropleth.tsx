"use client";

import { ChoroplethMap } from "./choropleth-map-dynamic";

interface USStatesChoroplethProps {
  allStates: string[];
  gaStates: string[];
  gaOnly: boolean;
}

export function USStatesChoropleth({ allStates, gaStates, gaOnly }: USStatesChoroplethProps) {
  const activeStates = gaOnly ? gaStates : allStates;
  const activeSet = new Set(activeStates);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">
        US States ({activeStates.length})
      </h2>
      <ChoroplethMap
        geoJsonUrl="/geo/us-states.json"
        visitedCodes={activeSet}
        featureCodeProperty="name"
        featureNameProperty="name"
        height="300px"
      />
    </div>
  );
}
