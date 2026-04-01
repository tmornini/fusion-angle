import {
    $, $input, $select, $textarea,
} from '../dom';
import type { Profile } from '../adapters';

export class ProfilePresenter {
    readonly #firstName: string;
    readonly #lastName: string;
    readonly #email: string;
    readonly #phone: string;
    readonly #role: string;
    readonly #department: string;
    readonly #bio: string;
    readonly #strengths: string[];

    constructor(profile: Profile) {
        this.#firstName =
            profile.firstName;
        this.#lastName =
            profile.lastName;
        this.#email = profile.email;
        this.#phone = profile.phone;
        this.#role = profile.role;
        this.#department =
            profile.department;
        this.#bio = profile.bio;
        this.#strengths =
            [...profile.strengths];
    }

    avatarInitials(): string {
        return this.#firstName.charAt(0)
            + this.#lastName.charAt(0);
    }

    initStrengths(
        set: Set<string>,
    ): void {
        for (
            const s of this.#strengths
        ) {
            set.add(s);
        }
    }

    populateForm(): void {
        const avatarEl = $(
            '#profile-avatar-initials',
            document,
        );
        if (avatarEl) {
            avatarEl.textContent =
                this.avatarInitials();
        }
        $input(
            '#profile-first-name',
            document,
        )!.value = this.#firstName;
        $input(
            '#profile-last-name',
            document,
        )!.value = this.#lastName;
        $input(
            '#profile-email',
            document,
        )!.value = this.#email;
        $input(
            '#profile-phone',
            document,
        )!.value = this.#phone;
        $input(
            '#profile-role',
            document,
        )!.value = this.#role;
        $select(
            '#profile-department',
            document,
        )!.value = this.#department;
        $textarea(
            '#profile-bio',
            document,
        )!.value = this.#bio;
    }
}
