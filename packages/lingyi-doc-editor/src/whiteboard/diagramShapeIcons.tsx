import React from 'react';
import type { ShapeKind } from '@lingyi-doc/core';

const S = { fill: 'none', stroke: '#333', strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const LIFELINE = { stroke: '#666', strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export function DiagramShapeIcon({ kind }: { kind: ShapeKind }): React.ReactNode {
  switch (kind) {
    case 'lineSolid':
      return <line x1="4" y1="12" x2="20" y2="12" {...S} />;
    case 'lineDashed':
      return <line x1="4" y1="12" x2="20" y2="12" {...S} strokeDasharray="3 2" />;
    case 'lineArrow':
      return <path d="M4 12h12m0 0l-3-3m3 3l-3 3" {...S} />;
    case 'lineArrowDouble':
      return <path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" {...S} />;
    case 'swimlaneV2':
      return (
        <>
          <rect x="4" y="5" width="16" height="3.5" fill="#f2f2f2" stroke="#333" strokeWidth="1" />
          <path d="M4 8.5h16M4 11h16M12 11v8" {...S} />
        </>
      );
    case 'swimlaneH2':
      return (
        <>
          <rect x="4" y="5" width="3.5" height="14" fill="#f2f2f2" stroke="#333" strokeWidth="1" />
          <path d="M7.5 5v14M10.5 5v14M10.5 12h9.5" {...S} />
        </>
      );
    case 'swimlaneV3':
      return <path d="M4 5h16v14H4zM7 5v14M12 5v14M17 5v14" {...S} />;
    case 'documentWavy':
      return <path d="M6 5h12v10c-2 2-4-1-6 0s-4 1-6 0V5z" {...S} />;
    case 'internalStorage':
      return (
        <>
          <ellipse cx="12" cy="7" rx="7" ry="2" {...S} />
          <path d="M5 7v10M19 7v10M8 7v10M16 7v10" {...S} />
          <ellipse cx="12" cy="17" rx="7" ry="2" {...S} />
        </>
      );
    case 'multiDocument':
      return (
        <>
          <path d="M8 6h11v9c-1.5 1.5-3-.5-4.5 0S11 16 9 15V6z" {...S} />
          <path d="M5 9h11v9c-1.5 1.5-3-.5-4.5 0S8 19 6 18V9z" {...S} />
        </>
      );
    case 'display':
      return <path d="M5 5h8a5 5 0 0 1 0 10H5V5z" {...S} />;
    case 'predefinedProcess':
      return <path d="M7 5h10v14H7zM9 5v14M15 5v14" {...S} />;
    case 'manualInput':
      return <polygon points="8,5 20,5 20,19 4,19" {...S} />;
    case 'flowDataFlow':
      return <path d="M8 8.5H17a2 3.5 0 0 1 0 7H8Q6 12 8 8.5Z" {...S} />;
    case 'flowOffPage':
      return <polygon points="5,6 19,6 19,13 12,19 5,13" {...S} />;
    case 'flowQueue':
      return (
        <>
          <circle cx="11" cy="11" r="5" {...S} />
          <path d="M15 15h5" {...S} />
        </>
      );
    case 'umlClass3':
      return <path d="M5 6h14v12H5zM5 10h14M5 14h14" {...S} />;
    case 'umlClass2':
      return <path d="M5 6h14v12H5zM5 12h14" {...S} />;
    case 'umlInterface':
      return <path d="M5 6h14v12H5zM15 6h4v4" {...S} />;
    case 'umlPackage':
      return <path d="M5 9h14v9H5zM5 6h7v3" {...S} />;
    case 'umlNote':
    case 'seqNote':
      return <path d="M6 5h10l2 2v12H6zM16 5v2h2" {...S} />;
    case 'umlAggregation':
      return <path d="M4 12h8l3-4 3 4 3-4" {...S} />;
    case 'umlComposition':
      return <path d="M4 12h8l3-4 3 4 3-4z" {...S} fill="#333" />;
    case 'umlGeneralization':
      return <path d="M4 12h10l4-4v8l-4-4" {...S} />;
    case 'umlRealization':
      return <path d="M4 12h10l4-4v8l-4-4" {...S} strokeDasharray="3 2" />;
    case 'umlDependency':
      return <path d="M4 12h12m0 0l-3-3m3 3l-3 3" {...S} strokeDasharray="3 2" />;
    case 'seqActor':
      return (
        <>
          <circle cx="12" cy="7" r="2.5" fill="#e6e9fe" stroke="#333" strokeWidth="1.5" />
          <path d="M12 9.5v4M8 11h8M12 13.5l-3 3M12 13.5l3 3" {...S} />
          <path d="M12 16.5v5" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'actorStick':
      return (
        <>
          <circle cx="12" cy="7" r="2.5" {...S} />
          <path d="M12 9.5v5M8 12h8M12 14.5l-3 4M12 14.5l3 4" {...S} />
        </>
      );
    case 'seqLifeline':
      return (
        <>
          <rect x="6" y="5" width="12" height="4" rx="1.5" {...S} />
          <path d="M12 9v10" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqDbLifeline':
      return (
        <>
          <ellipse cx="12" cy="7" rx="6" ry="2" {...S} />
          <path d="M6 7v3M18 7v3" {...S} />
          <ellipse cx="12" cy="10" rx="6" ry="2" {...S} />
          <path d="M12 10v9" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqStorageLifeline':
      return (
        <>
          <path d="M7 7a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7z" {...S} />
          <ellipse cx="7" cy="9" rx="2" ry="2" {...S} />
          <ellipse cx="17" cy="9" rx="2" ry="2" {...S} />
          <path d="M12 13v6" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqBoundaryLifeline':
      return (
        <>
          <path d="M5 7v6M5 10h4" {...S} />
          <circle cx="13" cy="10" r="3" {...S} />
          <path d="M13 13v6" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqControlLifeline':
      return (
        <>
          <circle cx="12" cy="10" r="3" {...S} />
          <path d="M10 6a4 4 0 0 1 4-2" {...S} />
          <path d="M12 13v6" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqEntityLifeline':
      return (
        <>
          <circle cx="12" cy="8" r="3" {...S} />
          <path d="M9 11h6" {...S} />
          <path d="M12 11v8" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqMessage':
      return (
        <>
          <rect x="9" y="5" width="10" height="4" rx="1" {...S} />
          <rect x="5" y="8" width="10" height="4" rx="1" {...S} />
          <path d="M12 12v7" {...LIFELINE} strokeDasharray="2 2" />
        </>
      );
    case 'seqActivation':
      return <rect x="10" y="5" width="4" height="14" fill="#8ab4f8" stroke="#333" strokeWidth="1" />;
    case 'seqFrame':
      return <path d="M5 9h14v9H5zM5 9h5M10 6v3M5 6h5" {...S} />;
    case 'seqAltFrame':
      return (
        <>
          <path d="M5 9h14v9H5zM5 9h5M10 6v3M5 6h5" {...S} />
          <path d="M5 13.5h14" {...S} strokeDasharray="2 2" />
        </>
      );
    case 'dfdDataStore':
      return <path d="M5 6h14v12H5zM5 10h14" {...S} />;
    case 'dfdSubProcess':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" {...S} />
          <circle cx="9" cy="12" r="0.8" fill="#333" stroke="none" />
          <circle cx="12" cy="12" r="0.8" fill="#333" stroke="none" />
          <circle cx="15" cy="12" r="0.8" fill="#333" stroke="none" />
        </>
      );
    case 'dfdStoreOpenRight':
      return <path d="M5 6v12M5 6h14M5 18h14" {...S} />;
    case 'dfdStoreOpenLeft':
      return <path d="M19 6v12M5 6h14M5 18h14" {...S} />;
    case 'erTable1':
      return <path d="M5 6h14v12H5zM5 10h14" {...S} />;
    case 'erTable2':
      return <path d="M5 6h14v12H5zM5 10h14M12 6v4" {...S} />;
    case 'erTable3':
      return <path d="M5 6h14v12H5zM5 10h14M10 6v4M15 6v4" {...S} />;
    case 'erTable4':
      return <path d="M5 6h14v12H5zM5 10h14M8.5 6v4M12 6v4M15.5 6v4" {...S} />;
    case 'compComponent':
      return <path d="M7 6h12v12H7zM5 9h3v3H5zM5 14h3v3H5z" {...S} />;
    case 'compComponentAlt':
      return <path d="M5 6h14v12H5zM15 7h4v3h-4z" {...S} />;
    case 'compProvided':
      return <path d="M4 12h10M14 12a3 3 0 1 0 0.01 0" {...S} />;
    case 'compAssembly':
      return <path d="M4 12h6a4 4 0 0 0 0 8h2a2 2 0 0 0 0-4" {...S} />;
    case 'compRequired':
      return <path d="M20 12H12a3 3 0 0 1 0-6" {...S} />;
    case 'stateInitial':
      return <circle cx="12" cy="12" r="4" fill="#333" stroke="none" />;
    case 'stateFinal':
      return (
        <>
          <circle cx="12" cy="12" r="6" fill="#333" stroke="none" />
          <circle cx="12" cy="12" r="4" fill="#fff" stroke="none" />
        </>
      );
    case 'stateForkJoin':
      return <rect x="4" y="10" width="16" height="4" fill="#333" stroke="none" />;
    case 'star4':
      return <polygon points="12,4 15,11 22,12 15,13 12,20 9,13 2,12 9,11" {...S} />;
    case 'star6':
      return <polygon points="12,3 14,9 20,9 15,13 17,20 12,16 7,20 9,13 4,9 10,9" {...S} />;
    case 'calloutBurst':
      return <path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5z" {...S} />;
    default:
      return null;
  }
}
