import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import { isTauriEnvironment } from '@/composables/useUiPreferences';

export const router = createRouter({
  history: isTauriEnvironment() ? createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', name: 'game', component: () => import('@/views/GamePage.vue'), meta: { title: 'PoolPoker' } },
    {
      path: '/webhook',
      name: 'webhook-settings',
      component: () => import('@/views/WebhookSettingsPage.vue'),
      meta: { title: 'Webhook 配置 - PoolPoker' },
    },
    { path: '/enter_robot', redirect: '/webhook' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : 'PoolPoker';
});
