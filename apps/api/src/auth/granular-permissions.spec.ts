import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';
import { AdminController } from '../admin/admin.controller';
import { OrganizationsController } from '../organizations/organizations.controller';
import { VaultController } from '../vault/vault.controller';

function requiredPermissions(
  controller: object,
  method: keyof typeof controller,
) {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS,
    controller[method],
  ) as string[];
}

describe('granular route permissions', () => {
  it('separates organization read, create, update and delete operations', () => {
    const controller = OrganizationsController.prototype;

    expect(requiredPermissions(controller, 'list')).toEqual([
      'organizations.read',
    ]);
    expect(requiredPermissions(controller, 'create')).toEqual([
      'organizations.create',
    ]);
    expect(requiredPermissions(controller, 'addMember')).toEqual([
      'organizations.update',
    ]);
    expect(requiredPermissions(controller, 'remove')).toEqual([
      'organizations.delete',
    ]);
    expect(requiredPermissions(controller, 'removeMember')).toEqual([
      'organizations.delete',
    ]);
  });

  it('separates vault read, create, update and delete operations', () => {
    const controller = VaultController.prototype;

    expect(requiredPermissions(controller, 'listVaults')).toEqual([
      'vault.read',
    ]);
    expect(requiredPermissions(controller, 'createItem')).toEqual([
      'vault.create',
    ]);
    expect(requiredPermissions(controller, 'updateItem')).toEqual([
      'vault.update',
    ]);
    expect(requiredPermissions(controller, 'deleteItem')).toEqual([
      'vault.delete',
    ]);
  });

  it('separates role read, create and update operations', () => {
    const controller = AdminController.prototype;

    expect(requiredPermissions(controller, 'listRoles')).toEqual([
      'roles.read',
    ]);
    expect(requiredPermissions(controller, 'createRole')).toEqual([
      'roles.create',
    ]);
    expect(requiredPermissions(controller, 'updateRolePermissions')).toEqual([
      'roles.update',
    ]);
  });
});
