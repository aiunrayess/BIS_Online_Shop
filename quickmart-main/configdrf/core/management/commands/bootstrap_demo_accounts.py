from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import BaseCommand, CommandError

from core.models import User


class Command(BaseCommand):
    help = (
        'Create non-production role demo accounts. A password must be provided '\
        'interactively or with --password; no default credentials are stored in the project.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--password', help='Initial password for newly-created demo accounts.')
        parser.add_argument('--domain', default='quickmart.test', help='Email domain for the demo accounts.')

    def handle(self, *args, **options):
        password = options['password']
        if not password:
            password = getpass('Initial demo-account password: ')
        if not password:
            raise CommandError('A non-empty password is required.')

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise CommandError(' '.join(exc.messages)) from exc

        domain = options['domain'].strip().lower()
        if not domain or '@' in domain:
            raise CommandError('Use a plain domain such as quickmart.test.')

        accounts = (
            ('buyer.demo', 'Demo', 'Buyer', User.ROLE_BUYER),
            ('seller.demo', 'Demo', 'Seller', User.ROLE_SELLER),
            ('head.manager', 'Head', 'Manager', User.ROLE_HEAD_MANAGER),
            ('security.manager', 'Security', 'Manager', User.ROLE_SECURITY_MANAGER),
            ('sales.manager', 'Sales', 'Manager', User.ROLE_MANAGER),
            ('warehouse.staff', 'Warehouse', 'Staff', User.ROLE_WAREHOUSE),
        )
        for local_part, first_name, last_name, role in accounts:
            email = f'{local_part}@{domain}'
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'role': role,
                    'is_active': True,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=('password',))
                self.stdout.write(self.style.SUCCESS(f'Created {role}: {email}'))
            else:
                self.stdout.write(f'Skipped existing account: {email}')
