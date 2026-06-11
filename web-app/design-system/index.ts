import { $required } from '../app/dom.ts';
import {
    CYCLE_DASH,
    LABEL_CHAR_WIDTH,
    LABEL_PADDING,
    LABEL_HEIGHT,
} from '../app/flow-graph.ts';
import {
    html,
    setHtml,
    trusted,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    iconCheck,
    iconX,
    iconAlertTriangle,
    iconInfo,
    iconSearch,
    iconPlus,
    iconArrowRight,
    iconTrash,
    iconSparkles,
    iconHome,
    iconTarget,
    iconUpload,
    iconAlertCircle,
} from '../app/icons.ts';

function buildColorSwatch(
    name: string,
    variable: string,
): SafeHtml {
    const cls =
        'bg' + variable.replace('--', '-');
    return html`<div class="color-swatch">
    <div class="${
        'color-swatch-block ' + cls
    }"></div>
    <div class="text-sm font-medium">${
        name}</div>
    <code class="text-xs text-muted">${
        variable}</code>
    </div>`;
}

function buildTypographyRow(
    label: string,
    className: string,
    sample: string,
): SafeHtml {
    return html`<div class="type-row">
    <code class="text-xs text-muted">${
        label}</code>
    <p class="${className}">${sample}</p>
    </div>`;
}

function buildShadowBox(
    name: string,
    variable: string,
): SafeHtml {
    const cls =
        'shadow' + variable.replace('--', '-');
    return html`<div class="shadow-swatch">
    <div class="${
        'shadow-swatch-block ' + cls
    }"></div>
    <code class="text-xs text-muted">${
        name}</code>
    </div>`;
}

const FLOW_BLUE = '#4B6CA1';
const FLOW_WARN = '#d97706';
const FLOW_GREEN = '#16a34a';

const NW = 140;
const NH = 56;

function buildFlowDefs(): string {
    return '<defs>'
        + '<marker id="ds-arrow"'
        + ' viewBox="0 0 10 10"'
        + ' refX="10" refY="5"'
        + ' markerWidth="8"'
        + ' markerHeight="8"'
        + ' orient="auto">'
        + '<path d="M 0 0 L 10 5'
        + ' L 0 10 z"'
        + ` fill="${FLOW_BLUE}"/>`
        + '</marker>'
        + '<marker id="ds-arrow-warn"'
        + ' viewBox="0 0 10 10"'
        + ' refX="10" refY="5"'
        + ' markerWidth="8"'
        + ' markerHeight="8"'
        + ' orient="auto">'
        + '<path d="M 0 0 L 10 5'
        + ' L 0 10 z"'
        + ` fill="${FLOW_WARN}"/>`
        + '</marker>'
        + '<marker id="ds-arrow-ok"'
        + ' viewBox="0 0 10 10"'
        + ' refX="10" refY="5"'
        + ' markerWidth="8"'
        + ' markerHeight="8"'
        + ' orient="auto">'
        + '<path d="M 0 0 L 10 5'
        + ' L 0 10 z"'
        + ` fill="${FLOW_GREEN}"/>`
        + '</marker>'
        + '</defs>';
}

function buildFlowNodeSvg(
    label: string,
    subtitle: string,
    borderColor: string,
    isArchive: boolean,
): SafeHtml {
    const halfW = NW / 2;
    const sw = isArchive ? 3
        : borderColor === FLOW_GREEN
            ? 2.5 : 2;
    let inner = '<rect'
        + ` width="${NW}"`
        + ` height="${NH}"`
        + ' rx="10"'
        + ' fill="var('
        + '--color-card-bg)"'
        + ` stroke="${borderColor}"`
        + ` stroke-width="${sw}"/>`;
    if (isArchive) {
        inner += '<rect'
            + ' x="4" y="4"'
            + ` width="${NW - 8}"`
            + ` height="${NH - 8}"`
            + ' rx="7" fill="none"'
            + ` stroke="${FLOW_GREEN}"`
            + ' stroke-width="1.5"/>';
    }
    const labelY = subtitle === '' ? 34 : 22;
    inner += '<text'
        + ` x="${halfW}" y="${labelY}"`
        + ' text-anchor="middle"'
        + ' font-size="14"'
        + ' font-weight="600"'
        + ' fill="var('
        + '--color-foreground,'
        + ' #e0e4ef)">'
        + label + '</text>';
    if (subtitle !== '') {
        inner += '<text'
            + ` x="${halfW}" y="40"`
            + ' text-anchor="middle"'
            + ' font-size="11"'
            + ' fill="var('
            + '--color-muted-foreground,'
            + ' #5a6480)">'
            + subtitle + '</text>';
    }
    inner += '<circle'
        + ' cx="0"'
        + ` cy="${NH / 2}"`
        + ' r="6"'
        + ` fill="${borderColor}"/>`;
    inner += '<circle'
        + ` cx="${NW}"`
        + ` cy="${NH / 2}"`
        + ' r="6"'
        + ` fill="${borderColor}"/>`;
    const pad = 8;
    const svgW = NW + pad * 2;
    const svgH = NH + pad * 2;
    return trusted(
        '<svg'
        + ` width="${svgW}"`
        + ` height="${svgH}"`
        + ` viewBox="${-pad} ${-pad}`
        + ` ${svgW} ${svgH}">`
        + inner
        + '</svg>',
    );
}

function buildFlowEdgeSvg(
    label: string,
    color: string,
    markerRef: string,
    isDashed: boolean,
): SafeHtml {
    const w = 200;
    const h = 40;
    const y = h / 2;
    const x1 = 10;
    const x2 = w - 10;
    const dash = isDashed
        ? ` stroke-dasharray="${CYCLE_DASH}"`
        : '';
    const mid = (x1 + x2) / 2;
    const lw = label.length * LABEL_CHAR_WIDTH
        + LABEL_PADDING;
    const lh = LABEL_HEIGHT;
    return trusted(
        `<svg width="${w}" height="${h}">`
        + buildFlowDefs()
        + '<path'
        + ` d="M ${x1} ${y}`
        + ` L ${x2} ${y}"`
        + ' fill="none"'
        + ` stroke="${color}"`
        + ' stroke-width="2"'
        + dash
        + ` marker-end="${markerRef}"/>`
        + '<rect'
        + ` x="${mid - lw / 2}"`
        + ` y="${y - lh / 2}"`
        + ` width="${lw}"`
        + ` height="${lh}"`
        + ' rx="4"'
        + ' fill="var('
        + '--color-card-bg)"'
        + ` stroke="${color}"`
        + ' stroke-width="1"'
        + ' opacity="0.9"/>'
        + '<text'
        + ` x="${mid}"`
        + ` y="${y + 4}"`
        + ' text-anchor="middle"'
        + ' font-size="11"'
        + ' fill="var('
        + '--color-foreground,'
        + ' #e0e4ef)">'
        + label + '</text>'
        + '</svg>',
    );
}

function buildFlowPortSvg(
    color: string,
    label: string,
): SafeHtml {
    return trusted(
        '<svg width="48" height="48">'
        + `<circle cx="24" cy="24"`
        + ` r="6" fill="${color}"/>`
        + '<text x="24" y="42"'
        + ' text-anchor="middle"'
        + ' font-size="10"'
        + ' fill="var('
        + '--color-muted-foreground,'
        + ' #5a6480)">'
        + label + '</text>'
        + '</svg>',
    );
}

function buildFlowPropPanel(): SafeHtml {
    return html`
    <div class="ds-prop-panel">
        <h4 class="${''
            }font-semibold text-sm mb-3">${''
            }Node Properties</h4>
        <div class="${
            'flex flex-col gap-3'
        }">
            <div class="ds-prop-field">
                <label class="${''
                    }text-xs text-muted">${''
                    }Name</label>
                <input class="input"
                    value="Data Capture"
                    readonly/>
            </div>
            <div class="ds-prop-field">
                <label class="${''
                    }text-xs text-muted">${''
                    }Type</label>
                <span class="${''
                    }badge badge-default">${''
                    }Standard</span>
            </div>
            <div class="ds-prop-field">
                <label class="${''
                    }text-xs text-muted">${''
                    }Fields</label>
                <span class="${''
                    }text-sm">8 fields</span>
            </div>
        </div>
    </div>`;
}

export async function init(): Promise<void> {
    const root = $required(
        '#design-system-content', document,
    );

    setHtml(root, html`
    <div class="ds-page">
        <div>
            <h1 class="${''
                }text-3xl font-bold${''
                } font-display">${''
                }Fusion AI Design System</h1>
            <p class="text-muted mt-2">${''
                }A production-ready design ${''
                }system ${''
                }for enterprise ${''
                }applications ${''
                }prioritizing clarity, ${''
                }trust, ${''
                }focus, and calm ${''
                }decision-making.</p>
        </div>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Brand Colors</h2>
                <p class="text-muted mt-1">${''
                    }Primary brand colors ${''
                    }for Fusion AI</p>
            </div>
            <div class="ds-grid-4"
                class="stats-grid">
                ${buildColorSwatch(
                    'Primary Blue',
                    '--primary',
                )}
                ${buildColorSwatch(
                    'Primary Foreground',
                    '--primary-foreground',
                )}
                ${buildColorSwatch(
                    'Accent Yellow',
                    '--accent',
                )}
                ${buildColorSwatch(
                    'Accent Foreground',
                    '--accent-foreground',
                )}
            </div>
        </section>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Blue Scale</h2>
                <p class="text-muted mt-1">${''
                    }Full blue color ramp ${''
                    }for ${''
                    }nuanced UI design</p>
            </div>
            <div class="ds-grid-5"
                class="stats-grid">
                ${buildColorSwatch(
                    'Blue 50', '--blue-50',
                )}
                ${buildColorSwatch(
                    'Blue 100', '--blue-100',
                )}
                ${buildColorSwatch(
                    'Blue 200', '--blue-200',
                )}
                ${buildColorSwatch(
                    'Blue 300', '--blue-300',
                )}
                ${buildColorSwatch(
                    'Blue 400', '--blue-400',
                )}
            </div>
            <div class="ds-grid-5"
                class="stats-grid">
                ${buildColorSwatch(
                    'Blue 500', '--blue-500',
                )}
                ${buildColorSwatch(
                    'Blue 600', '--blue-600',
                )}
                ${buildColorSwatch(
                    'Blue 700', '--blue-700',
                )}
                ${buildColorSwatch(
                    'Blue 800', '--blue-800',
                )}
                ${buildColorSwatch(
                    'Blue 900', '--blue-900',
                )}
            </div>
        </section>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Semantic Colors</h2>
                <p class="text-muted mt-1">${''
                    }Status and feedback ${''
                    }colors ${''
                    }(WCAG AA compliant)</p>
            </div>
            <div class="ds-grid-4"
                class="stats-grid">
                ${buildColorSwatch(
                    'Success', '--success',
                )}
                ${buildColorSwatch(
                    'Warning', '--warning',
                )}
                ${buildColorSwatch(
                    'Destructive',
                    '--destructive',
                )}
                ${buildColorSwatch(
                    'Info', '--info',
                )}
            </div>
            <div class="ds-grid-4"
                class="stats-grid">
                ${buildColorSwatch(
                    'Success Soft',
                    '--success-soft',
                )}
                ${buildColorSwatch(
                    'Warning Soft',
                    '--warning-soft',
                )}
                ${buildColorSwatch(
                    'Error Soft',
                    '--error-soft',
                )}
                ${buildColorSwatch(
                    'Info Soft',
                    '--info-soft',
                )}
            </div>
        </section>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }UI Colors</h2>
                <p class="text-muted mt-1">${''
                    }Background, surface, ${''
                    }and ${''
                    }border colors</p>
            </div>
            <div class="ds-grid-6"
                class="stats-grid">
                ${buildColorSwatch(
                    'Background',
                    '--background',
                )}
                ${buildColorSwatch(
                    'Foreground',
                    '--foreground',
                )}
                ${buildColorSwatch(
                    'Card', '--card',
                )}
                ${buildColorSwatch(
                    'Muted', '--muted',
                )}
                ${buildColorSwatch(
                    'Border', '--border',
                )}
                ${buildColorSwatch(
                    'Ring', '--ring',
                )}
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Typography</h2>
                <p class="text-muted mt-1">${''
                    }IBM Plex Sans for ${''
                    }display, ${''
                    }Inter for body text</p>
            </div>
            <div class="card p-6">
                ${buildTypographyRow(
                    'text-4xl / font-display'
                    + ' / font-bold',
                    'text-4xl font-display'
                    + ' font-bold',
                    'Hero Headlines',
                )}
                ${buildTypographyRow(
                    'text-3xl / font-display'
                    + ' / font-bold',
                    'text-3xl font-display'
                    + ' font-bold',
                    'Page Titles',
                )}
                ${buildTypographyRow(
                    'text-2xl / font-semibold',
                    'text-2xl font-semibold',
                    'Section Headers',
                )}
                ${buildTypographyRow(
                    'text-xl / font-semibold',
                    'text-xl font-semibold',
                    'Subsection Headers',
                )}
                ${buildTypographyRow(
                    'text-lg / font-medium',
                    'text-lg font-medium',
                    'Card Titles',
                )}
                ${buildTypographyRow(
                    'text-base',
                    'text-base',
                    'Body text for general '
                    + 'content and descriptions',
                )}
                ${buildTypographyRow(
                    'text-sm',
                    'text-sm',
                    'Dense body text for '
                    + 'tables and lists',
                )}
                ${buildTypographyRow(
                    'text-xs',
                    'text-xs',
                    'Labels and helper text',
                )}
                ${buildTypographyRow(
                    'text-2xs',
                    'text-2xs',
                    'Fine print and micro labels',
                )}
                ${buildTypographyRow(
                    'font-mono / text-sm',
                    'font-mono text-sm',
                    "const code = 'monospace';",
                )}
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Buttons</h2>
                <p class="text-muted mt-1">${''
                    }All button variants ${''
                    }and sizes</p>
            </div>
            <div class="card p-6">
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Variants</h3>
                <div class="${''
                    }flex flex-wrap gap-3 mb-4">
                    <button class="${''
                        }btn btn-primary">${''
                        }Default</button>
                    <button class="${''
                        }btn btn-secondary">${''
                        }Secondary</button>
                    <button class="${''
                        }btn btn-outline">${''
                        }Outline</button>
                    <button class="${''
                        }btn btn-ghost">${''
                        }Ghost</button>
                    <button class="${''
                        }btn btn-destructive">${''
                        }Destructive</button>
                    <button class="${''
                        }btn btn-success">${''
                        }Success</button>
                    <button class="${''
                        }btn btn-hero">${''
                        }Hero</button>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Soft Variants</h3>
                <div class="${''
                    }flex flex-wrap gap-3 mb-4">
                    <button class="${
                        'btn ds-soft-btn'
                    }" data-tone="primary">${
                        'Soft Primary'
                    }</button>
                    <button class="${
                        'btn ds-soft-btn'
                    }" data-tone="success">${
                        'Soft Success'
                    }</button>
                    <button class="${
                        'btn ds-soft-btn'
                    }" data-tone="warning">${
                        'Soft Warning'
                    }</button>
                    <button class="${
                        'btn ds-soft-btn'
                    }" data-tone="error">${
                        'Soft Destructive'
                    }</button>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Disabled</h3>
                <div class="${''
                    }flex flex-wrap gap-3 mb-4">
                    <button class="${''
                        }btn btn-primary"
                        disabled>${''
                        }Disabled</button>
                    <button class="${''
                        }btn btn-outline"
                        disabled>${''
                        }Disabled Outline${''
                        }</button>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Sizes</h3>
                <div class="${''
                    }flex flex-wrap ${''
                    }items-center ${''
                    }gap-3 mb-4">
                    <button class="${''
                        }btn btn-primary${''
                        } btn-xs">${''
                        }Extra Small</button>
                    <button class="${''
                        }btn btn-primary${''
                        } btn-sm">${''
                        }Small</button>
                    <button class="${''
                        }btn btn-primary">${''
                        }Default</button>
                    <button class="${''
                        }btn btn-primary${''
                        } btn-lg">${''
                        }Large</button>
                    <button class="${''
                        }btn btn-primary${''
                        } btn-xl">${''
                        }Extra Large</button>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }With Icons</h3>
                <div class="${
                    'flex flex-wrap gap-3'
                }">
                    <button class="${''
                        }btn btn-primary${''
                        } gap-2">${''
                        }${iconPlus(16, '')
                        } Create</button>
                    <button class="${''
                        }btn btn-outline${''
                        } gap-2">${''
                        }${iconSearch(16, '')} ${''
                        }Search</button>
                    <button class="${''
                        }btn btn-outline${''
                        } gap-2">${''
                        }Continue ${''
                        }${iconArrowRight(16, '')
                        }</button>
                    <button class="${''
                        }btn btn-destructive${''
                        } gap-2">${''
                        }${iconTrash(16, '')} ${''
                        }Delete</button>
                    <button class="${''
                        }btn btn-primary${''
                        } btn-icon">${''
                        }${iconPlus(20, '')}</button>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Badges</h2>
                <p class="text-muted mt-1">${''
                    }Status indicators ${''
                    }and labels</p>
            </div>
            <div class="card p-6">
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Standard</h3>
                <div class="${''
                    }flex flex-wrap gap-3 mb-4">
                    <span class="${''
                        }badge badge-default">${''
                        }Default</span>
                    <span class="${''
                        }badge${''
                        } badge-secondary">${''
                        }Secondary</span>
                    <span class="${''
                        }badge${''
                        } badge-outline">${''
                        }Outline</span>
                    <span class="${''
                        }badge${''
                        } badge-primary">${''
                        }Primary</span>
                    <span class="${''
                        }badge${''
                        } badge-destructive">${''
                        }Destructive</span>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Status with Dot</h3>
                <div class="${''
                    }flex flex-wrap gap-3 mb-4">
                    <span class="${''
                        }badge${''
                        } badge-success">${''
                        }${iconCheck(12, '')} ${''
                        }Approved</span>
                    <span class="${''
                        }badge${''
                        } badge-warning">${''
                        }${iconAlertTriangle(12, '')
                        } ${''
                        }Pending</span>
                    <span class="${''
                        }badge badge-error">${''
                        }${iconX(12, '')} ${''
                        }Rejected</span>
                    <span class="${''
                        }status-badge-info">${''
                        }${iconInfo(12, '')
                        } Info</span>
                </div>
                <h3 class="${''
                    }font-semibold mb-4">${''
                    }Soft Accent</h3>
                <div class="${
                    'flex flex-wrap gap-3'
                }">
                    <span class="${
                        'ds-accent-badge'
                    }">${''
                        }Accent Badge</span>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Form Elements</h2>
                <p class="text-muted mt-1">${''
                    }Input fields and ${''
                    }text areas</p>
            </div>
            <div class="ds-grid-2"
                class="convert-grid">
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-4">${''
                        }Inputs</h3>
                    <div class="ds-stack">
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Default ${''
                                }Input</label>
                            <input class="input"
                                placeholder="${''
                                }Enter text..."/>
                        </div>
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }With ${''
                                }Value</label>
                            <input class="input"
                                value="${
                                    'Sample'
                                    + ' content'
                                }"/>
                        </div>
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Error ${''
                                }State</label>
                            <input class="${''
                                }input${''
                                } input-error"
                                value="${
                                    'Invalid'
                                    + ' input'
                                }"/>
                            <p class="${
                                    'text-xs mt-1'
                                    + ' text-error'
                                }">${''
                                }This field ${''
                                }is ${''
                                }required</p>
                        </div>
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Disabled</label>
                            <input class="input"
                                disabled
                                placeholder="${''
                                }Disabled${''
                                } input"/>
                        </div>
                    </div>
                </div>
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-4">${''
                        }Textareas</h3>
                    <div class="ds-stack">
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Default ${''
                                }Textarea</label>
                            <textarea
                                class="textarea"
                                placeholder="${''
                                }Enter longer${''
                                } text...">${''
                                }</textarea>
                        </div>
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Error ${''
                                }State</label>
                            <textarea class="${''
                                }textarea${''
                                } input-error">${''
                                }Invalid${''
                                } content${''
                                }</textarea>
                            <p class="${
                                    'text-xs mt-1'
                                    + ' text-error'
                                }">${''
                                }Please provide${''
                                } a valid ${''
                                }description</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Cards</h2>
                <p class="text-muted mt-1">${''
                    }Content containers ${''
                    }with ${''
                    }consistent styling</p>
            </div>
            <div class="ds-grid-3"
                class="score-grid">
                <div class="card card-hover"
                    class="p-6">
                    <h3 class="${''
                        }font-semibold mb-1">${''
                        }Fusion Card</h3>
                    <p class="${''
                        }text-xs text-muted${''
                        } mb-2">${''
                        }With hover effect</p>
                    <p class="${''
                        }text-sm text-muted">${''
                        }Hover over this ${''
                        }card to ${''
                        }see the subtle ${''
                        }shadow ${''
                        }effect.</p>
                </div>
                <div class="card card-flat"
                    class="p-6">
                    <h3 class="${''
                        }font-semibold mb-1">${''
                        }Flat Card</h3>
                    <p class="${''
                        }text-xs text-muted${''
                        } mb-2">${''
                        }No shadow or hover</p>
                    <p class="${''
                        }text-sm text-muted">${''
                        }A minimal card with${''
                        } just ${''
                        }a border, suitable${''
                        } for ${''
                        }secondary ${''
                        }content.</p>
                </div>
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-1">${''
                        }Standard Card</h3>
                    <p class="${''
                        }text-xs text-muted${''
                        } mb-2">${''
                        }Default styling</p>
                    <p class="${''
                        }text-sm text-muted">${''
                        }The standard card ${''
                        }with ${''
                        }subtle shadow, ${''
                        }suitable ${''
                        }for most ${''
                        }content.</p>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Elevation &amp; ${''
                    }Shadows</h2>
                <p class="text-muted mt-1">${''
                    }Shadow scale for depth${''
                    } ${''
                    }and hierarchy</p>
            </div>
            <div class="ds-grid-5"
                class="stats-grid">
                ${buildShadowBox(
                    'shadow-xs',
                    '--shadow-xs',
                )}
                ${buildShadowBox(
                    'shadow-sm',
                    '--shadow-sm',
                )}
                ${buildShadowBox(
                    'shadow-md',
                    '--shadow-md',
                )}
                ${buildShadowBox(
                    'shadow-lg',
                    '--shadow-lg',
                )}
                ${buildShadowBox(
                    'shadow-xl',
                    '--shadow-xl',
                )}
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Iconography</h2>
                <p class="text-muted mt-1">${''
                    }Lucide-compatible ${''
                    }inline ${''
                    }SVG icons at standard${''
                    } ${''
                    }sizes</p>
            </div>
            <div class="card p-6">
                <div class="${''
                    }flex items-end gap-8">
                    ${[16, 20, 24, 48].map(
                        size => html`
                    <div class="icon-size-col">
                        <div class="text-primary"
                            >${iconSparkles(
                                size, '',
                            )}</div>
                        <code class="${''
                            }text-xs${''
                            } text-muted">${''
                            }${size}px</code>
                    </div>
                    `,
                    )}
                </div>
                <div class="${''
                    }flex flex-wrap gap-4${''
                    } mt-6 ${''
                    }pt-4 section-divider-top">
                    ${[
                      {
                          fn: iconHome,
                          name: 'Home',
                      },
                      {
                          fn: iconSearch,
                          name: 'Search',
                      },
                      {
                          fn: iconPlus,
                          name: 'Plus',
                      },
                      {
                          fn: iconCheck,
                          name: 'Check',
                      },
                      {
                          fn: iconX,
                          name: 'X',
                      },
                      {
                          fn: iconTarget,
                          name: 'Target',
                      },
                      {
                          fn: iconAlertTriangle,
                          name: 'Alert',
                      },
                      {
                          fn: iconInfo,
                          name: 'Info',
                      },
                      {
                          fn: iconTrash,
                          name: 'Trash',
                      },
                      {
                          fn: iconUpload,
                          name: 'Upload',
                      },
                    ].map(entry => html`
                    <div class="icon-col">
                        <div class="${
                            'text-foreground'
                        }">${entry.fn(20, '')
                            }</div>
                        <span class="${''
                            }text-2xs${''
                            } text-muted">${''
                            }${entry.name
                            }</span>
                    </div>
                    `)}
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Spacing System</h2>
                <p class="text-muted mt-1">${''
                    }8pt grid for ${''
                    }consistent ${''
                    }spacing</p>
            </div>
            <div class="card p-6">
                ${[
                  {
                      name: 'space-1',
                      value: '4px',
                      w: '0.25rem',
                  },
                  {
                      name: 'space-2',
                      value: '8px',
                      w: '0.5rem',
                  },
                  {
                      name: 'space-3',
                      value: '12px',
                      w: '0.75rem',
                  },
                  {
                      name: 'space-4',
                      value: '16px',
                      w: '1rem',
                  },
                  {
                      name: 'space-6',
                      value: '24px',
                      w: '1.5rem',
                  },
                  {
                      name: 'space-8',
                      value: '32px',
                      w: '2rem',
                  },
                  {
                      name: 'space-12',
                      value: '48px',
                      w: '3rem',
                  },
                  {
                      name: 'space-16',
                      value: '64px',
                      w: '4rem',
                  },
                ].map(space => html`
                <div class="${''
                    }flex items-center gap-4 ${''
                    }mb-3">
                    <code class="${
                        'text-xs text-muted'
                        + ' w-rem-5'
                    }">${space.name}</code>
                    <div class="ds-space-bar"
                        style="--space-w:${space.w}"
                    ></div>
                    <span class="${''
                        }text-sm text-muted">${''
                        }${space.value}</span>
                </div>
                `)}
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">Toast</h2>
                <p class="text-muted mt-1">${''
                    }Transient ${''
                    }notifications ${''
                    }dispatched via ${''
                    }showToast()</p>
            </div>
            <div class="card p-6">
                <div class="ds-toast-col">
                    ${[
                        {
                            v: 'success',
                            m: 'Saved successfully',
                        },
                        {
                            v: 'error',
                            m: 'Failed to save',
                        },
                        {
                            v: 'warning',
                            m: 'Connection unstable',
                        },
                        {
                            v: 'info',
                            m: 'New version available',
                        },
                    ].map(t => html`
                    <div class="${
                        'toast toast-' + t.v
                    }" role="status">
                        <span class="${
                            'toast-message'
                        }">${t.m}</span>
                        <button class="${
                            'toast-close'
                        }"
                            aria-label="Dismiss"
                        >&times;</button>
                    </div>
                    `)}
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Error &amp; System ${''
                    }States</h2>
                <p class="text-muted mt-1">${''
                    }Patterns for ${''
                    }validation ${''
                    }errors, failures, ${''
                    }and ${''
                    }system messages</p>
            </div>
            <div class="ds-grid-2"
                class="convert-grid">
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-3">${''
                        }Inline Validation</h3>
                    <div class="${
                        'flex flex-col gap-3'
                    }">
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Email ${''
                                }Address</label>
                            <input class="${''
                                }input${''
                                } input-error"
                                value="${
                                    'invalid'
                                    + '-email'
                                }"/>
                            <p class="${''
                                }text-xs mt-1${''
                                } flex ${''
                                }items-center${''
                                } gap-1 text-error">${''
                                }${
                                iconAlertCircle(12, '')
                                } ${''
                                }Please enter ${''
                                }a valid ${''
                                }email ${''
                                }address</p>
                        </div>
                        <div>
                            <label class="${''
                                }label mb-1${''
                                } text-sm">${''
                                }Project ${''
                                }Name</label>
                            <input class="${
                                'input'
                                + ' ds-success-border'
                            }"
                                value="${''
                                }AI Segmentation"/>
                            <p class="${''
                                }text-xs mt-1${''
                                } flex ${''
                                }items-center${''
                                } gap-1${''
                                } text-success">${''
                                }${iconCheck(12, '')
                                } ${''
                                }Looks good!</p>
                        </div>
                    </div>
                </div>
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-3">${''
                        }Upload Failed</h3>
                    <div class="ds-upload-fail">
                        ${iconUpload(
                            32, 'text-error',
                        )}
                        <p class="${''
                            }font-medium${''
                            } text-sm mt-2 text-error">${''
                            }Upload Failed</p>
                        <p class="${''
                            }text-xs${''
                            } text-muted${''
                            } mt-1">${''
                            }File exceeds ${''
                            }maximum ${''
                            }size of 10MB</p>
                        <button class="${''
                            }btn btn-outline ${''
                            }btn-sm mt-3">${''
                            }Try Again</button>
                    </div>
                </div>
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-3">${''
                        }Save Failed</h3>
                    <div class="ds-soft-row" data-tone="error">
                        ${iconAlertCircle(
                            20,
                            'text-error',
                        )}
                        <div class="flex-1">
                            <p class="${''
                                }text-sm${''
                                } font-medium text-error">${''
                                }Changes could${''
                                } not ${''
                                }be saved</p>
                            <p class="${''
                                }text-xs${''
                                } text-muted ${''
                                }mt-0.5">${''
                                }Please check${''
                                } your ${''
                                }connection ${''
                                }and ${''
                                }try again.</p>
                        </div>
                        <button class="${''
                            }btn btn-outline ${''
                            }btn-xs">${''
                            }Retry</button>
                    </div>
                </div>
                <div class="card p-6">
                    <h3 class="${''
                        }font-semibold mb-3">${''
                        }Connection Issue</h3>
                    <div class="ds-soft-row" data-tone="warning">
                        ${iconAlertTriangle(
                            20,
                            'text-warning',
                        )}
                        <div class="flex-1">
                            <p class="${''
                                }text-sm${''
                                } font-medium text-warning">${''
                                }Connection ${''
                                }interrupted</p>
                            <p class="${''
                                }text-xs${''
                                } text-muted ${''
                                }mt-0.5">${''
                                }Reconnecting${''
                                } ${''
                                }automatically${''
                                }...</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card p-6">
                <h3 class="${''
                    }font-semibold mb-3">${''
                    }Inline System Error</h3>
                <div class="ds-soft-row" data-tone="error">
                    ${iconAlertCircle(
                        20,
                        'text-error',
                    )}
                    <div class="flex-1">
                        <p class="${''
                            }text-sm${''
                            } font-medium text-error">${''
                            }Something went${''
                            } wrong</p>
                        <p class="${''
                            }text-xs${''
                            } text-muted ${''
                            }mt-0.5">${''
                            }An unexpected${''
                            } error ${''
                            }occurred while${''
                            } loading ${''
                            }this section.${''
                            } Our team ${''
                            }has been ${''
                            }notified.</p>
                    </div>
                    <button class="${''
                        }btn btn-outline ${''
                        }btn-sm">${''
                        }Reload Section</button>
                </div>
            </div>
            <div class="${
                'card text-center p-12'
            }">
                <h3 class="${''
                    }font-semibold mb-3">${''
                    }Full Page Error</h3>
                <div class="p-8">
                    ${iconAlertTriangle(
                        48,
                        'text-error',
                    )}
                    <h3 class="${''
                        }text-xl font-display${''
                        } ${''
                        }font-semibold mt-4">${''
                        }Something went${''
                        } wrong</h3>
                    <p class="${''
                        }text-sm text-muted${''
                        } mt-2${''
                        } ds-fullpage-err-desc">${''
                        }We encountered an ${''
                        }unexpected error. ${''
                        }Please try ${''
                        }refreshing ${''
                        }the page or ${''
                        }contact ${''
                        }support if the ${''
                        }problem ${''
                        }persists.</p>
                    <div class="${''
                        }flex justify-center${''
                        } ${''
                        }gap-3 mt-6">
                        <button class="${''
                            }btn${''
                            } btn-primary">${''
                            }Refresh ${''
                            }Page</button>
                        <button class="${''
                            }btn${''
                            } btn-outline">${''
                            }Contact ${''
                            }Support</button>
                    </div>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Usage Guidelines</h2>
                <p class="text-muted mt-1">${''
                    }Do's and don'ts for ${''
                    }the ${''
                    }design system</p>
            </div>
            <div class="ds-grid-2"
                class="convert-grid">
                <div class="card"
                    class="ds-do-card">
                    <h3 class="${''
                        }font-semibold${''
                        } text-success${''
                        } flex items-center ${''
                        }gap-2 mb-4">${''
                        }${iconCheck(20, '')
                        } Do</h3>
                    <div class="text-sm"
                        class="flex flex-col gap-2">
                        <p>${iconCheck(
                            14,
                            'text-success',
                        )} Use semantic ${''
                            }color ${''
                            }tokens, not ${''
                            }raw ${''
                            }hex values</p>
                        <p>${iconCheck(
                            14,
                            'text-success',
                        )} Maintain ${''
                            }consistent ${''
                            }spacing with ${''
                            }the ${''
                            }8pt grid</p>
                        <p>${iconCheck(
                            14,
                            'text-success',
                        )} Ensure all ${''
                            }interactive ${''
                            }elements have ${''
                            }focus states</p>
                        <p>${iconCheck(
                            14,
                            'text-success',
                        )} Use the proper${''
                            } ${''
                            }typography ${''
                            }scale ${''
                            }for hierarchy</p>
                        <p>${iconCheck(
                            14,
                            'text-success',
                        )} Test contrast ${''
                            }ratios ${''
                            }for ${''
                            }accessibility</p>
                    </div>
                </div>
                <div class="card"
                    class="ds-dont-card">
                    <h3 class="${''
                        }font-semibold${''
                        } text-error ${''
                        }flex items-center ${''
                        }gap-2 mb-4">${''
                        }${iconX(20, '')
                        } Don't</h3>
                    <div class="text-sm"
                        class="flex flex-col gap-2">
                        <p>${iconX(
                            14,
                            'text-error',
                        )} Use pure black${''
                            } ${''
                            }(#000) for ${''
                            }text</p>
                        <p>${iconX(
                            14,
                            'text-error',
                        )} Create custom ${''
                            }colors ${''
                            }outside the ${''
                            }system</p>
                        <p>${iconX(
                            14,
                            'text-error',
                        )} Use decorative${''
                            } ${''
                            }animations</p>
                        <p>${iconX(
                            14,
                            'text-error',
                        )} Skip focus ${''
                            }states on ${''
                            }interactive ${''
                            }elements</p>
                        <p>${iconX(
                            14,
                            'text-error',
                        )} Mix typography ${''
                            }scales ${''
                            }inconsistently${''
                            }</p>
                    </div>
                </div>
            </div>
        </section>

        <hr class="ds-hr"/>

        <section class="ds-section">
            <div>
                <h2 class="${''
                    }text-2xl font-semibold ${''
                    }font-display">${''
                    }Flow Components</h2>
                <p class="text-muted mt-1">${''
                    }Visual vocabulary for ${''
                    }the flow designer</p>
            </div>

            <h3 class="font-semibold">${''
                }Node Variants</h3>
            <div class="ds-grid-3"
                class="stats-grid">
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Start Node</code>
                    ${buildFlowNodeSvg(
                        'Start',
                        '',
                        FLOW_GREEN,
                        false,
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Standard Node</code>
                    ${buildFlowNodeSvg(
                        'Data Capture',
                        '8 fields',
                        FLOW_BLUE,
                        false,
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Complete Node</code>
                    ${buildFlowNodeSvg(
                        'End',
                        '',
                        FLOW_GREEN,
                        true,
                    )}
                </div>
            </div>

            <h3 class="font-semibold">${''
                }Edge Variants</h3>
            <div class="ds-grid-3"
                class="stats-grid">
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Forward Edge</code>
                    ${buildFlowEdgeSvg(
                        'submit',
                        FLOW_BLUE,
                        'url(#ds-arrow)',
                        false,
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Cycle Edge</code>
                    ${buildFlowEdgeSvg(
                        'needs revision',
                        FLOW_WARN,
                        'url(#ds-arrow-warn)',
                        true,
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Completion Edge</code>
                    ${buildFlowEdgeSvg(
                        'approve',
                        FLOW_GREEN,
                        'url(#ds-arrow-ok)',
                        false,
                    )}
                </div>
            </div>

            <h3 class="font-semibold">${''
                }Port Styles</h3>
            <div class="${''
                }flex flex-wrap gap-6">
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Standard</code>
                    ${buildFlowPortSvg(
                        FLOW_BLUE, 'port',
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Start / End</code>
                    ${buildFlowPortSvg(
                        FLOW_GREEN, 'port',
                    )}
                </div>
                <div class="ds-stack">
                    <code class="${''
                        }text-xs text-muted">${''
                        }Cycle</code>
                    ${buildFlowPortSvg(
                        FLOW_WARN, 'port',
                    )}
                </div>
            </div>

            <h3 class="font-semibold">${''
                }Properties Panel</h3>
            ${buildFlowPropPanel()}
        </section>
    </div>`);
}
