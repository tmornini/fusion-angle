import type {
    IdeaEntity,
    IdeaSubmissionEntity,
} from '../types.ts';
import { daysFromNow } from './seed-kit.ts';

// The seeded ideas. Fixed data; the composition root sets
// organization_id at write time (the type omits it).
export function buildIdeas():
    Omit<
        IdeaEntity,
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >[] {
    return [
        {
            id: 'YvOylAxOjQcgmNmsSoVBPQ',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            position: 1,
            problem_statement:
                'Marketing team spends 20+'
                + ' hours weekly manually'
                + ' segmenting customers,'
                + ' leading to delayed'
                + ' campaigns and missed'
                + ' opportunities.',
            target_users:
                'Marketing team,'
                + ' campaign managers,'
                + ' data analysts',
            proposed_solution:
                'Implement machine learning'
                + ' model to automatically'
                + ' segment customers based'
                + ' on behavior patterns.',
            expected_outcome:
                'Reduce segmentation time'
                + ' by 80% and increase'
                + ' conversion rates'
                + ' by 25%.',
            success_metrics:
                '80% reduction in manual'
                + ' segmentation time, 25%'
                + ' increase in campaign'
                + ' conversion rates',
        },
        {
            id: 'WurwPqXxGtLhRAoCEcPzfQ',
            title: 'Automated Report'
                + ' Generation',
            position: 2,
            problem_statement:
                'Analysts spend 15+ hours'
                + ' per week manually'
                + ' compiling reports from'
                + ' multiple data sources,'
                + ' causing delays in'
                + ' decision-making.',
            target_users:
                'Business analysts,'
                + ' finance team,'
                + ' department heads',
            proposed_solution:
                'Build an automated'
                + ' pipeline that aggregates'
                + ' data sources and'
                + ' generates formatted'
                + ' reports on a schedule.',
            expected_outcome:
                'Eliminate manual report'
                + ' assembly, freeing 15'
                + ' analyst-hours weekly and'
                + ' reducing report delivery'
                + ' time from days to'
                + ' minutes.',
            success_metrics:
                '90% reduction in report'
                + ' preparation time,'
                + ' 100% on-time delivery',
        },
        {
            id: 'yrDiezFyhDHGgXzGeIWoSQ',
            title: 'Predictive Maintenance'
                + ' System',
            position: 3,
            problem_statement:
                'Unplanned equipment'
                + ' downtime costs $50K per'
                + ' incident and occurs 3-4'
                + ' times per quarter due to'
                + ' reactive maintenance.',
            target_users:
                'Operations team,'
                + ' maintenance crew,'
                + ' plant managers',
            proposed_solution:
                'Deploy IoT sensors with'
                + ' ML models to predict'
                + ' equipment failures 2-4'
                + ' weeks before they occur.',
            expected_outcome:
                'Reduce unplanned downtime'
                + ' by 70% and extend'
                + ' equipment lifespan by'
                + ' 20%, saving $150K'
                + ' annually.',
            success_metrics: '',
        },
        {
            id: 'pYmalQFqpoXdbpYAJfOswA',
            title: 'Real-time Analytics'
                + ' Dashboard',
            position: 4,
            problem_statement:
                'Leadership relies on'
                + ' weekly batch reports'
                + ' that are outdated by the'
                + ' time they arrive,'
                + ' missing real-time'
                + ' trends.',
            target_users:
                'Executive team,'
                + ' VP of operations,'
                + ' product managers',
            proposed_solution:
                'Create a live dashboard'
                + ' with streaming data'
                + ' pipelines, interactive'
                + ' filters, and automated'
                + ' anomaly alerts.',
            expected_outcome:
                'Enable real-time'
                + ' decision-making,'
                + ' reducing response time'
                + ' to market changes from'
                + ' 5 days to under 1 hour.',
            success_metrics:
                'Dashboard response time'
                + ' under 2 seconds, 95%'
                + ' daily active usage'
                + ' by leadership',
        },
        {
            id: 'RAHAvUqwVABJnzTniWhUTQ',
            title: 'Smart Inventory'
                + ' Optimization',
            position: 5,
            problem_statement:
                'Excess inventory ties up'
                + ' $2M in capital while'
                + ' stockouts cause 8% of'
                + ' orders to be delayed or'
                + ' cancelled.',
            target_users: '',
            proposed_solution:
                'Implement demand'
                + ' forecasting with'
                + ' automatic reorder'
                + ' triggers based on'
                + ' seasonality, trends, and'
                + ' lead times.',
            expected_outcome: '',
            success_metrics: '',
        },
        {
            id: 'IjrYiSuRyjkQaqiRLhadAg',
            title: 'Employee Training'
                + ' Assistant',
            position: 6,
            problem_statement:
                'New hire onboarding takes'
                + ' 6 weeks on average, with'
                + ' inconsistent training'
                + ' quality across'
                + ' departments.',
            target_users:
                'New hires, HR team,'
                + ' department trainers',
            proposed_solution:
                'Build an AI training'
                + ' assistant that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions.',
            expected_outcome:
                'Reduce onboarding time to'
                + ' 3 weeks and improve new'
                + ' hire productivity scores'
                + ' by 40% in the first'
                + ' quarter.',
            success_metrics:
                '50% faster onboarding,'
                + ' 40% higher new-hire'
                + ' productivity scores',
        },
        {
            id: 'MmMKBsQBLxNfbMAOlAaKkQ',
            title: 'AI-Powered Customer'
                + ' Support Chatbot',
            position: 8,
            problem_statement:
                'Support team handles'
                + ' 500+ tier-1 tickets'
                + ' daily, with average'
                + ' response time of 4'
                + ' hours.',
            target_users:
                'Customer support team,'
                + ' customers, support'
                + ' operations manager',
            proposed_solution:
                'Deploy an AI chatbot'
                + ' trained on historical'
                + ' tickets to resolve'
                + ' common inquiries'
                + ' instantly.',
            expected_outcome:
                'Deflect 60% of tier-1'
                + ' tickets and cut'
                + ' average response time'
                + ' to under 30 seconds.',
            success_metrics:
                '60% ticket deflection'
                + ' rate, CSAT above 4.5,'
                + ' average response time'
                + ' under 30 seconds',
        },
        {
            id: 'QtpzfPiJsMdmoDpPaHvtVQ',
            title: 'Mobile App Push'
                + ' Notification Revamp',
            position: 10,
            problem_statement:
                'Push notification opt-out'
                + ' rate is 42% due to'
                + ' irrelevant, poorly'
                + ' timed messages.',
            target_users:
                'Mobile app users,'
                + ' product team,'
                + ' marketing',
            proposed_solution:
                'Implement user-preference'
                + ' controls and ML-based'
                + ' send-time optimization.',
            expected_outcome:
                'Reduce opt-out rate to'
                + ' under 20% and increase'
                + ' notification engagement'
                + ' by 35%.',
            success_metrics:
                'Opt-out rate below 20%,'
                + ' 35% higher engagement'
                + ' on push notifications',
        },
        {
            id: 'eizcntIrQMWrajcGkQZvUA',
            title: 'Sustainability Dashboard'
                + ' for Operations',
            position: 9,
            problem_statement:
                'No centralized view of'
                + ' energy, water, and'
                + ' waste metrics across'
                + ' facilities.',
            target_users: '',
            proposed_solution:
                'Build a dashboard that'
                + ' aggregates utility data'
                + ' and tracks ESG goals'
                + ' in real time.',
            expected_outcome:
                'Achieve 15% reduction in'
                + ' energy costs and meet'
                + ' annual ESG reporting'
                + ' requirements.',
            success_metrics:
                '15% energy cost'
                + ' reduction, ESG report'
                + ' delivery on schedule',
        },
        {
            id: 'AzSBhumyEAkdkFSUBaJrpA',
            title: 'Employee Wellness'
                + ' Program Integration',
            position: 11,
            problem_statement:
                'Employee burnout rates'
                + ' are rising with no'
                + ' unified wellness'
                + ' tracking or resources.',
            target_users:
                'All employees, HR team,'
                + ' people operations',
            proposed_solution:
                'Integrate wellness'
                + ' vendors into a single'
                + ' portal with usage'
                + ' analytics for HR.',
            expected_outcome:
                'Increase wellness'
                + ' program participation'
                + ' by 50% and reduce'
                + ' voluntary turnover'
                + ' by 12%.',
            success_metrics:
                '50% participation'
                + ' increase, 12% lower'
                + ' voluntary turnover',
        },
        {
            id: 'PkrEwSLQlrldLRwlAMVhRA',
            title: 'Real-time Inventory'
                + ' Tracking System',
            position: 7,
            problem_statement:
                'Inventory counts rely on'
                + ' manual audits that lag'
                + ' 48 hours behind actual'
                + ' stock movements.',
            target_users:
                'Warehouse staff,'
                + ' supply chain team,'
                + ' logistics managers',
            proposed_solution:
                'Deploy barcode and RFID'
                + ' scanning with live'
                + ' sync to the warehouse'
                + ' management system.',
            expected_outcome:
                'Achieve 99.5% inventory'
                + ' accuracy and eliminate'
                + ' end-of-day manual'
                + ' reconciliation.',
            success_metrics:
                '99.5% inventory accuracy,'
                + ' zero manual'
                + ' reconciliation needed',
        },
    ];
}

// The idea-submission events: who submitted which idea, when.
// Fixed data depending only on the deterministic date helper.
export function buildIdeaSubmissions(): IdeaSubmissionEntity[] {
    return [
        {
            id: 'kjChIrvrvaNXEhpohHPURg',
            idea_id: 'YvOylAxOjQcgmNmsSoVBPQ',
            member_id: 'MQFcPtrZPIGjMCRAXtZUnA',
            at: daysFromNow(-75, 9, 30),
        },
        {
            id: 'SuheyYcQfTOPXGyeqsqmUw',
            idea_id: 'WurwPqXxGtLhRAoCEcPzfQ',
            member_id: 'VvzFEpfYONDAsCCwNlIFCQ',
            at: daysFromNow(-70, 9, 0),
        },
        {
            id: 'TWVpNUvGVKNcergXlXZfPA',
            idea_id: 'yrDiezFyhDHGgXzGeIWoSQ',
            member_id: 'CJrglMsNBxOWWfbihHQSeg',
            at: daysFromNow(-65, 9, 0),
        },
        {
            id: 'XLrkPPZXeWzBgjErAzUUVA',
            idea_id: 'pYmalQFqpoXdbpYAJfOswA',
            member_id: 'jrMOZzVdWXvLgMpcHoyBTw',
            at: daysFromNow(-55, 9, 0),
        },
        {
            id: 'kmYrAaAsYYbipfyTCZATOg',
            idea_id: 'RAHAvUqwVABJnzTniWhUTQ',
            member_id: 'RPzLGrWcstxLaHoBcViPLQ',
            at: daysFromNow(-50, 9, 0),
        },
        {
            id: 'rOBaIUyyvaMtzsXBEqTuJA',
            idea_id: 'IjrYiSuRyjkQaqiRLhadAg',
            member_id: 'DAjUkaBUIZbXSQeoLDZEXQ',
            at: daysFromNow(-45, 9, 0),
        },
        {
            id: 'BKNuxAUFxJBYZwYAUcJQjw',
            idea_id: 'MmMKBsQBLxNfbMAOlAaKkQ',
            member_id: 'MQFcPtrZPIGjMCRAXtZUnA',
            at: daysFromNow(-75, 10, 0),
        },
        {
            id: 'WqNYwKeOTRiYFhEYbZbliQ',
            idea_id: 'QtpzfPiJsMdmoDpPaHvtVQ',
            member_id: 'IzdIgJaTTfIZQUudGcmdtA',
            at: daysFromNow(-35, 9, 0),
        },
        {
            id: 'RiylIfXqZbLtQacHWFSnFA',
            idea_id: 'eizcntIrQMWrajcGkQZvUA',
            member_id: 'CJrglMsNBxOWWfbihHQSeg',
            at: daysFromNow(-30, 9, 0),
        },
        {
            id: 'nTNaMOcABmOmLEiPAfPWGw',
            idea_id: 'AzSBhumyEAkdkFSUBaJrpA',
            member_id: 'jrMOZzVdWXvLgMpcHoyBTw',
            at: daysFromNow(-25, 9, 0),
        },
        {
            id: 'AMALRwMTMjEEJTztGHiINg',
            idea_id: 'PkrEwSLQlrldLRwlAMVhRA',
            member_id: 'RPzLGrWcstxLaHoBcViPLQ',
            at: daysFromNow(-20, 9, 0),
        },
    ];
}
