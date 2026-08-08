import { Injectable } from '@nestjs/common';
import { MenuItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MenuNode = Pick<
  MenuItem,
  'id' | 'key' | 'label' | 'path' | 'icon' | 'type' | 'sortOrder'
> & { children: MenuNode[] };

@Injectable()
export class NavigationService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuForUser(userId: string): Promise<MenuNode[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const permissionIds = new Set(
      user?.roles.flatMap((userRole) =>
        userRole.role.permissions.map(
          (rolePermission) => rolePermission.permissionId,
        ),
      ) ?? [],
    );
    const menuItems = await this.prisma.menuItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const allowedItems = menuItems.filter(
      (menuItem) =>
        menuItem.isVisible &&
        (!menuItem.permissionId || permissionIds.has(menuItem.permissionId)),
    );

    return this.toTree(allowedItems, null);
  }

  private toTree(menuItems: MenuItem[], parentId: string | null): MenuNode[] {
    return menuItems
      .filter((menuItem) => menuItem.parentId === parentId)
      .map((menuItem) => ({
        id: menuItem.id,
        key: menuItem.key,
        label: menuItem.label,
        path: menuItem.path,
        icon: menuItem.icon,
        type: menuItem.type,
        sortOrder: menuItem.sortOrder,
        children: this.toTree(menuItems, menuItem.id),
      }))
      .filter(
        (menuItem) => menuItem.type !== 'GROUP' || menuItem.children.length > 0,
      );
  }
}
