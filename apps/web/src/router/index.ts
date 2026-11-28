import { createRouter, createWebHashHistory } from "vue-router";
import { useHelloStore } from "@/stores/hello";
import { useWorkspaceStore } from "@/stores/workspace";
import { publicWeb } from "@/stores/multiTenant";
import { desktopAccountUser } from "@/lib/lumoAccountService";
import { adminRoute } from "@/pages/multiTenant/router";
const skipLocalWelcome = () => publicWeb.value || Boolean(desktopAccountUser.value);
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: () => skipLocalWelcome() ? "/home" : "/hello",
    },
    {
      path: "/hello",
      beforeEnter: async () => skipLocalWelcome() || await useHelloStore().load() ? { path: "/home", replace: true } : true,
      component: () => import("@/pages/hello/index.vue"),
    },
    // ACT: appShell 是全局壳，持有侧栏生命周期；/home 和 /workspace 作为子路由
    // 渲染在 shellContent 的 <router-view /> 里，侧栏不随页面切换销毁重建。
    {
      path: "/",
      component: () => import("@/pages/appShell.vue"),
      children: [
        {
          path: "home",
          component: () => import("@/pages/home/index.vue"),
        },
        {
          path: "home/cases/:caseId",
          name: "marketCase",
          component: () => import("@/pages/home/index.vue"),
        },
        {
          path: "canvas",
          redirect: "/workspace",
        },
        {
          path: "workspace",
          beforeEnter: () => publicWeb.value && !useWorkspaceStore().project ? { path: "/home", replace: true } : true,
          component: () => import("@/pages/workspace/index.vue"),
        },
      ],
    },
    adminRoute,
  ],
});
export default router;
