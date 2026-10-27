import type {ReactNode} from 'react';
/** Legacy returns its original children without adding layout wrappers. */
export default function PresentationDisclosure({legacy,title,children}:{legacy:boolean;title:string;children:ReactNode}){return legacy?<>{children}</>:<details className="phase31-secondary"><summary>{title}</summary>{children}</details>;}
