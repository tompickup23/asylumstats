export interface RegionMapGeometry {
  regionName: string;
  path: string;
  labelLines: string[];
  labelX: number;
  labelY: number;
  valueX: number;
  valueY: number;
  labelAnchor?: "start" | "middle" | "end";
  calloutPath?: string;
}

export const REGION_MAP_WIDTH = 620;
export const REGION_MAP_HEIGHT = 760;

export const REGION_MAP_OUTLINES = {
  mainland:
    "M248 20 L320 34 L384 68 L420 124 L420 174 L432 226 L428 286 L444 336 L438 408 L456 470 L486 644 L470 692 L420 708 L374 726 L322 736 L268 730 L220 712 L180 714 L134 724 L84 718 L60 682 L64 644 L88 624 L100 582 L98 520 L104 464 L114 430 L144 396 L162 350 L150 286 L138 188 L146 138 L170 88 L204 52 Z",
  northernIreland: "M52 298 L92 290 L122 306 L128 344 L112 380 L78 392 L48 372 L40 336 Z"
} as const;

export const REGION_MAP_GEOMETRY: Record<string, RegionMapGeometry> = {
  Scotland: {
    regionName: "Scotland",
    path: "M248 28 L314 36 L374 72 L412 126 L416 170 L402 214 L430 258 L414 302 L378 328 L340 340 L324 368 L278 364 L246 344 L206 352 L178 330 L156 302 L146 266 L150 220 L138 184 L146 142 L170 94 L204 58 Z",
    labelLines: ["Scotland"],
    labelX: 286,
    labelY: 166,
    valueX: 286,
    valueY: 194
  },
  "Northern Ireland": {
    regionName: "Northern Ireland",
    path: "M54 302 L90 292 L120 308 L126 342 L110 376 L78 388 L50 372 L40 338 Z",
    labelLines: ["Northern", "Ireland"],
    labelX: 172,
    labelY: 320,
    valueX: 172,
    valueY: 350,
    labelAnchor: "start",
    calloutPath: "M126 336 L154 336"
  },
  "North West": {
    regionName: "North West",
    path: "M174 332 L206 352 L246 344 L278 364 L270 416 L248 450 L214 458 L188 430 L170 390 L164 350 Z",
    labelLines: ["North", "West"],
    labelX: 220,
    labelY: 382,
    valueX: 220,
    valueY: 414
  },
  "North East": {
    regionName: "North East",
    path: "M278 364 L324 368 L340 340 L378 328 L414 302 L432 346 L424 394 L398 430 L358 446 L320 430 L296 400 Z",
    labelLines: ["North", "East"],
    labelX: 362,
    labelY: 382,
    valueX: 362,
    valueY: 414
  },
  "Yorkshire and The Humber": {
    regionName: "Yorkshire and The Humber",
    path: "M270 416 L296 400 L320 430 L358 446 L350 490 L324 520 L284 524 L258 494 L248 450 Z",
    labelLines: ["Yorkshire", "Humber"],
    labelX: 304,
    labelY: 458,
    valueX: 304,
    valueY: 490
  },
  Wales: {
    regionName: "Wales",
    path: "M118 430 L144 404 L170 390 L188 430 L214 458 L226 500 L212 542 L194 584 L170 620 L134 618 L112 580 L106 528 L110 472 Z",
    labelLines: ["Wales"],
    labelX: 162,
    labelY: 518,
    valueX: 162,
    valueY: 546
  },
  "West Midlands": {
    regionName: "West Midlands",
    path: "M226 500 L248 450 L258 494 L284 524 L276 566 L246 584 L214 564 L206 528 Z",
    labelLines: ["West", "Midlands"],
    labelX: 246,
    labelY: 522,
    valueX: 246,
    valueY: 554
  },
  "East Midlands": {
    regionName: "East Midlands",
    path: "M284 524 L324 520 L350 490 L378 516 L386 560 L364 588 L320 594 L292 574 L276 566 Z",
    labelLines: ["East", "Midlands"],
    labelX: 332,
    labelY: 528,
    valueX: 332,
    valueY: 560
  },
  "East of England": {
    regionName: "East of England",
    path: "M378 516 L416 500 L454 520 L472 560 L468 604 L488 648 L470 678 L430 674 L404 642 L382 602 L364 588 L386 560 Z",
    labelLines: ["East of", "England"],
    labelX: 430,
    labelY: 572,
    valueX: 430,
    valueY: 604
  },
  "South West": {
    regionName: "South West",
    path: "M94 620 L134 618 L170 620 L194 584 L224 606 L220 652 L196 688 L160 708 L120 724 L82 716 L62 680 L66 646 Z",
    labelLines: ["South", "West"],
    labelX: 152,
    labelY: 656,
    valueX: 152,
    valueY: 688
  },
  "South East": {
    regionName: "South East",
    path: "M246 584 L292 574 L320 594 L364 588 L382 602 L404 642 L382 688 L336 712 L290 712 L246 688 L224 652 L224 606 Z",
    labelLines: ["South", "East"],
    labelX: 308,
    labelY: 648,
    valueX: 308,
    valueY: 680
  },
  London: {
    regionName: "London",
    path: "M314 618 L340 610 L364 624 L362 654 L336 666 L312 650 Z",
    labelLines: ["London"],
    labelX: 420,
    labelY: 624,
    valueX: 420,
    valueY: 652,
    labelAnchor: "start",
    calloutPath: "M362 638 L402 638"
  }
};

export const REGION_MAP_DRAW_ORDER = [
  "Scotland",
  "Northern Ireland",
  "North West",
  "North East",
  "Yorkshire and The Humber",
  "Wales",
  "West Midlands",
  "East Midlands",
  "South West",
  "South East",
  "East of England",
  "London"
] as const;

export function getRegionMapGeometry(regionName: string): RegionMapGeometry | null {
  return REGION_MAP_GEOMETRY[regionName] ?? null;
}
