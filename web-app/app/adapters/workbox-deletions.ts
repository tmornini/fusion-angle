import { DELETE } from '../../../api/api';

export async function deleteWorkOrderClaim(
    claimId: string,
): Promise<void> {
    await DELETE(
        `work-order-claims/${claimId}`,
    );
}
