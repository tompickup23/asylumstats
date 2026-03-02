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
    "M258 18 C292 8 336 14 374 34 C412 54 448 88 466 128 C484 168 492 212 496 252 C500 294 506 334 518 374 C530 416 544 458 550 506 C556 548 562 596 566 634 C570 666 564 702 546 726 C524 754 486 766 452 756 C426 748 412 730 396 712 C364 726 328 734 292 736 C254 738 218 730 184 718 C154 724 126 722 102 706 C78 690 68 664 74 638 C82 606 102 584 110 554 C116 526 112 496 116 460 C120 420 136 390 154 364 C172 338 178 314 176 286 C174 252 162 222 160 188 C158 152 168 122 188 94 C206 68 228 40 258 18 Z",
  northernIreland: "M56 304 C76 294 100 294 118 306 C132 318 136 340 130 358 C122 378 102 392 78 394 C58 394 42 382 38 364 C34 344 40 318 56 304 Z"
} as const;

export const REGION_MAP_GEOMETRY: Record<string, RegionMapGeometry> = {
  Scotland: {
    regionName: "Scotland",
    path: "M260 24 C292 16 332 20 366 40 C396 58 422 86 440 120 C454 148 466 180 468 208 C470 236 456 266 434 288 C406 314 376 324 350 332 C328 340 320 356 300 366 C274 378 246 374 222 356 C198 338 182 312 176 282 C170 252 164 220 164 188 C164 154 172 124 190 96 C208 68 230 42 260 24 Z",
    labelLines: ["Scotland"],
    labelX: 308,
    labelY: 162,
    valueX: 308,
    valueY: 190
  },
  "Northern Ireland": {
    regionName: "Northern Ireland",
    path: "M58 306 C78 298 98 298 114 308 C124 318 128 336 124 352 C116 370 98 382 78 384 C60 384 48 374 44 358 C40 340 46 320 58 306 Z",
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
    path: "M178 296 C192 314 210 330 234 340 C258 350 278 360 286 380 C294 402 288 424 272 446 C254 470 228 478 204 470 C182 462 166 444 160 422 C152 394 154 364 162 338 C166 324 170 308 178 296 Z",
    labelLines: ["North", "West"],
    labelX: 220,
    labelY: 390,
    valueX: 220,
    valueY: 422
  },
  "North East": {
    regionName: "North East",
    path: "M286 380 C296 356 312 340 334 330 C360 318 388 316 414 304 C432 296 448 282 460 266 C472 294 474 324 470 354 C466 382 454 408 432 424 C406 442 378 448 352 446 C326 444 304 430 292 406 C288 398 286 390 286 380 Z",
    labelLines: ["North", "East"],
    labelX: 388,
    labelY: 386,
    valueX: 388,
    valueY: 418
  },
  "Yorkshire and The Humber": {
    regionName: "Yorkshire and The Humber",
    path: "M272 446 C290 430 316 426 340 432 C364 440 388 444 404 460 C418 474 422 496 414 516 C404 538 384 552 360 556 C334 560 308 556 288 540 C272 526 262 506 262 484 C262 470 266 456 272 446 Z",
    labelLines: ["Yorkshire", "Humber"],
    labelX: 340,
    labelY: 478,
    valueX: 340,
    valueY: 510
  },
  Wales: {
    regionName: "Wales",
    path: "M114 434 C128 406 146 382 166 360 C168 392 176 418 194 442 C212 466 222 488 224 512 C226 540 214 568 200 592 C184 620 170 646 144 654 C120 662 98 654 90 632 C82 610 86 584 88 558 C90 526 92 494 98 466 C100 454 106 444 114 434 Z",
    labelLines: ["Wales"],
    labelX: 156,
    labelY: 528,
    valueX: 156,
    valueY: 560
  },
  "West Midlands": {
    regionName: "West Midlands",
    path: "M224 512 C232 490 248 474 268 468 C288 462 308 470 318 488 C330 508 328 532 316 550 C304 570 284 582 262 586 C240 588 222 576 214 556 C208 542 212 526 224 512 Z",
    labelLines: ["West", "Midlands"],
    labelX: 266,
    labelY: 526,
    valueX: 266,
    valueY: 558
  },
  "East Midlands": {
    regionName: "East Midlands",
    path: "M320 488 C336 470 360 464 384 468 C406 472 426 486 434 508 C442 530 438 556 422 576 C404 596 378 604 352 602 C328 600 306 586 294 566 C286 550 288 530 298 514 C304 504 312 496 320 488 Z",
    labelLines: ["East", "Midlands"],
    labelX: 366,
    labelY: 530,
    valueX: 366,
    valueY: 562
  },
  "East of England": {
    regionName: "East of England",
    path: "M434 508 C456 500 482 506 500 522 C518 540 524 566 522 592 C520 616 532 638 540 662 C546 680 544 702 530 716 C514 732 488 734 468 724 C446 714 430 696 420 674 C410 652 402 628 388 612 C378 600 372 584 374 566 C378 540 400 516 434 508 Z",
    labelLines: ["East of", "England"],
    labelX: 466,
    labelY: 584,
    valueX: 466,
    valueY: 616
  },
  "South West": {
    regionName: "South West",
    path: "M88 626 C112 620 136 620 156 610 C178 600 196 582 214 584 C228 586 236 600 236 620 C236 646 226 670 206 688 C186 708 162 722 136 730 C112 736 88 734 72 718 C58 704 56 680 64 660 C70 646 78 634 88 626 Z",
    labelLines: ["South", "West"],
    labelX: 150,
    labelY: 662,
    valueX: 150,
    valueY: 694
  },
  "South East": {
    regionName: "South East",
    path: "M236 620 C250 604 274 596 298 596 C324 596 350 602 374 596 C392 592 410 600 424 616 C440 634 448 660 446 686 C444 708 430 728 410 742 C388 756 362 760 336 758 C308 756 282 748 258 734 C236 722 220 702 216 678 C212 654 218 634 236 620 Z",
    labelLines: ["South", "East"],
    labelX: 328,
    labelY: 670,
    valueX: 328,
    valueY: 702
  },
  London: {
    regionName: "London",
    path: "M340 640 C352 632 366 632 376 640 C386 648 388 662 382 674 C372 684 356 686 344 680 C334 672 332 654 340 640 Z",
    labelLines: ["London"],
    labelX: 420,
    labelY: 642,
    valueX: 420,
    valueY: 670,
    labelAnchor: "start",
    calloutPath: "M382 658 L404 658"
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
