import type { ProjectEntity } from '../types.ts';
import { dateOnly } from './seed-kit.ts';

// The seeded Projects. l2cProjectId is shared with the
// Lead-to-Close project-flow binding and the project state
// events, so it is exported. Fixed data; the composition root
// assigns organization_id at write time.
export const l2cProjectId =
    'L2cP01SalesPip3l1n3L01';

export function buildProjects():
    Omit<ProjectEntity, 'organization_id'>[] {
    return [
        {
            id: 'u6YkHhlGc91oDMkr3x0isa',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            description:
                'Machine-learning model'
                + ' that segments customers'
                + ' in real time from'
                + ' behavior, purchase'
                + ' history, and engagement.',
            progress: 67,
            start_date: dateOnly(-60),
            target_end_date: dateOnly(30),
            estimated_cost: 88000,
            actual_cost: 51000,
            position: 1,
        },
        {
            id: 'jRE2Tj32NHsFGZIeEADp0p',
            title: 'Automated Report'
                + ' Generation',
            description:
                'Pipeline that aggregates'
                + ' multiple sources and'
                + ' ships formatted reports'
                + ' on a schedule.',
            progress: 100,
            start_date: dateOnly(-110),
            target_end_date: dateOnly(-45),
            estimated_cost: 56000,
            actual_cost: 58000,
            position: 2,
        },
        {
            id: l2cProjectId,
            title: 'Sales Pipeline'
                + ' Modernization',
            description:
                'Replace the legacy lead'
                + ' workflow with a triage-'
                + 'first pipeline:'
                + ' discovery, qualification,'
                + ' proposal, negotiation,'
                + ' close.',
            progress: 69,
            start_date: dateOnly(-55),
            target_end_date: dateOnly(25),
            estimated_cost: 78000,
            actual_cost: 48000,
            position: 3,
        },
        {
            id: 'P04PredMa1ntzyXY010203',
            title: 'Predictive Maintenance'
                + ' System',
            description:
                'IoT sensors plus ML'
                + ' models that predict'
                + ' equipment failures'
                + ' before they occur.',
            progress: 17,
            start_date: dateOnly(-18),
            target_end_date: dateOnly(90),
            estimated_cost: 110000,
            actual_cost: 7000,
            position: 4,
        },
        {
            id: 'P05RtAna1ytcsXY010203Z',
            title: 'Real-time Analytics'
                + ' Dashboard',
            description:
                'Live dashboard with'
                + ' streaming pipelines and'
                + ' automated anomaly alerts'
                + ' for leadership.',
            progress: 100,
            start_date: dateOnly(-95),
            target_end_date: dateOnly(-40),
            estimated_cost: 50000,
            actual_cost: 52000,
            position: 5,
        },
        {
            id: 'P06SmInvOptZyXY010203A',
            title: 'Smart Inventory'
                + ' Optimization',
            description:
                'Demand forecasting with'
                + ' automatic reorder'
                + ' triggers to cut carrying'
                + ' costs and stockouts.',
            progress: 76,
            start_date: dateOnly(-38),
            target_end_date: dateOnly(12),
            estimated_cost: 64000,
            actual_cost: 84000,
            position: 6,
        },
        {
            id: 'P07Empl0yTrainZyXY00B0',
            title: 'Employee Training'
                + ' Assistant',
            description:
                'AI training assistant'
                + ' that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions for'
                + ' new hires.',
            progress: 10,
            start_date: dateOnly(-12),
            target_end_date: dateOnly(110),
            estimated_cost: 60000,
            actual_cost: 3500,
            position: 7,
        },
        {
            id: 'P08CustSuppKn0wXY01C0D',
            title: 'Customer Support'
                + ' Knowledge Base',
            description:
                'Unified knowledge hub'
                + ' with AI-assisted search'
                + ' across tickets,'
                + ' runbooks, and product'
                + ' docs.',
            progress: 69,
            start_date: dateOnly(-48),
            target_end_date: dateOnly(22),
            estimated_cost: 64000,
            actual_cost: 42000,
            position: 8,
        },
        {
            id: 'P09C0mp1AudAut0mXY01E0',
            title: 'Compliance Audit'
                + ' Automation',
            description:
                'Auto-collect evidence,'
                + ' reconcile control'
                + ' mappings, and ship the'
                + ' annual SOC 2 dossier in'
                + ' hours rather than weeks.',
            progress: 86,
            start_date: dateOnly(-72),
            target_end_date: dateOnly(12),
            estimated_cost: 102000,
            actual_cost: 142000,
            position: 9,
        },
        {
            id: 'P10MlRgD1s4stRc1XY01FG',
            title: 'Multi-Region Disaster'
                + ' Recovery',
            description:
                'Active-active failover'
                + ' across two regions with'
                + ' five-minute RPO and'
                + ' fifteen-minute RTO.',
            progress: 91,
            start_date: dateOnly(-82),
            target_end_date: dateOnly(8),
            estimated_cost: 134000,
            actual_cost: 99000,
            position: 10,
        },
        {
            id: 'P11V0iceField0psXY01HJ',
            title: 'Voice-Driven Field'
                + ' Operations',
            description:
                'Hands-free voice agent'
                + ' for field techs: ticket'
                + ' updates, parts lookup,'
                + ' and onsite knowledge'
                + ' access.',
            progress: 53,
            start_date: dateOnly(-40),
            target_end_date: dateOnly(35),
            estimated_cost: 76000,
            actual_cost: 36000,
            position: 11,
        },
        {
            id: 'P12CarbF00tprXY01K0L0M',
            title: 'Carbon Footprint'
                + ' Tracking',
            description:
                'Ingest fleet, facility,'
                + ' and supplier emissions,'
                + ' then surface the live'
                + ' carbon ledger for ESG'
                + ' reporting.',
            progress: 100,
            start_date: dateOnly(-120),
            target_end_date: dateOnly(-35),
            estimated_cost: 62000,
            actual_cost: 56000,
            position: 12,
        },
        {
            id: 'P13W0rk4rcF0r3castsXY1',
            title: 'Workforce Capacity'
                + ' Forecasting',
            description:
                'Predict staffing demand'
                + ' by region and skill,'
                + ' then surface gaps eight'
                + ' weeks before they bite.',
            progress: 17,
            start_date: dateOnly(-22),
            target_end_date: dateOnly(105),
            estimated_cost: 90000,
            actual_cost: 8500,
            position: 13,
        },
        {
            id: 'P14SmartD0cumtR0utngX1',
            title: 'Smart Document Routing',
            description:
                'Classify and route'
                + ' inbound docs by content,'
                + ' urgency, and customer'
                + ' tier without a human'
                + ' bottleneck.',
            progress: 78,
            start_date: dateOnly(-65),
            target_end_date: dateOnly(18),
            estimated_cost: 70000,
            actual_cost: 45000,
            position: 14,
        },
        {
            id: 'P15Inv3st0rRep0rtP1Y00',
            title: 'Investor Reporting'
                + ' Portal',
            description:
                'Self-serve portal for'
                + ' LPs with quarterly'
                + ' statements, capital-call'
                + ' workflows, and'
                + ' audit-ready exports.',
            progress: 67,
            start_date: dateOnly(-58),
            target_end_date: dateOnly(28),
            estimated_cost: 56000,
            actual_cost: 34000,
            position: 15,
        },
        {
            id: 'P16MktSent1mentXY01020',
            title: 'Market Sentiment'
                + ' Analyzer',
            description:
                'NLP pipeline that scores'
                + ' brand sentiment across'
                + ' social and news feeds,'
                + ' freshly submitted for'
                + ' review.',
            progress: 0,
            start_date: dateOnly(-5),
            target_end_date: dateOnly(120),
            estimated_cost: 42000,
            actual_cost: 0,
            position: 16,
        },
    ];
}
