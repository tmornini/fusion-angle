import { GET } from '../../../api/api';
import type {
    CrunchColumnEntity,
    CrunchColumnAcronymEntity,
    CrunchColumnAcronymLinkEntity,
} from '../../../api/types';
import { parseJson } from './helpers';

export interface CrunchColumn {
    id: string;
    originalName: string;
    friendlyName: string;
    dataType: string;
    description: string;
    sampleValues: string[];
    isAcronym: boolean;
    acronymExpansion: string;
}

export async function getCrunchColumns(
): Promise<CrunchColumn[]> {
    const [rows, acronyms, links] =
        await Promise.all([
            GET<CrunchColumnEntity[]>(
                'crunch-columns',
            ),
            GET<CrunchColumnAcronymEntity[]>(
                'crunch-column-acronyms',
            ),
            GET<
                CrunchColumnAcronymLinkEntity[]
            >(
                'crunch-column'
                + '-acronym-links',
            ),
        ]);
    const acronymMap = new Map(
        acronyms.map(
            a => [a.id, a.expansion],
        ),
    );
    const linkByColumnId = new Map(
        links.map(
            l => [
                l.crunch_column_id,
                l.crunch_column_acronym_id,
            ],
        ),
    );
    return rows.map(row => {
        const acronymId =
            linkByColumnId.get(row.id);
        return {
            id: row.id,
            originalName: row.original_name,
            friendlyName: row.friendly_name,
            dataType: row.data_type,
            description: row.description,
            sampleValues:
                parseJson<string[]>(
                    row.sample_values,
                    [],
                ),
            isAcronym:
                acronymId !== undefined,
            acronymExpansion: acronymId
                ? acronymMap.get(acronymId)!
                : '',
        };
    });
}

