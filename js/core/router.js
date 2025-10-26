// js/core/router.js
// Điều hướng giữa các tab trong dashboard + hiệu ứng chuyển mượt

function changeTab(tabId) {
  // Ẩn tất cả tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active', 'fade-in');
  });

  // Hiển thị tab được chọn
  const activeTab = document.getElementById(tabId);
  if (activeTab) {
    activeTab.classList.add('active');
    // 🎨 Thêm animation sau một khung hình (đảm bảo hoạt động mượt)
    setTimeout(() => activeTab.classList.add('fade-in'), 20);
  }

  // Cập nhật sidebar
  document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
  const activeMenu = document.querySelector(`.sidebar li[onclick*='${tabId}']`);
  if (activeMenu) activeMenu.classList.add('active');

  // 🎯 Làm mượt chiều cao khi đổi tab
  const content = document.querySelector('.dashboard-content');
  if (content && activeTab) {
    const newHeight = activeTab.scrollHeight;
    const minHeight = 600;
    const targetHeight = Math.max(newHeight, minHeight);
    content.style.transition = 'height 0.35s ease';
    content.style.height = targetHeight + 'px';
  }
}

// Căn chiều cao khi trang load
window.addEventListener('load', () => {
  const firstTab = document.querySelector('.tab.active');
  const content = document.querySelector('.dashboard-content');
  if (content && firstTab) {
    const firstHeight = firstTab.scrollHeight;
    content.style.height = Math.max(firstHeight, 600) + 'px';
  }
});
