import React, { useEffect, useMemo, useState, useCallback } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { MENU_CATEGORIES, CATEGORY_DISPLAY_NAMES } from '../../utils/constants';
import './AdminMenuPage.css';

const CUSTOM_CATEGORY_VALUE = '__CUSTOM__';
const toInputDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

function AdminMenuPage() {
  const [menuItems, setMenuItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [currentEditItem, setCurrentEditItem] = useState(null);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [draggedCategory, setDraggedCategory] = useState(null);
  const [availableCategories, setAvailableCategories] = useState(MENU_CATEGORIES);
  const [activeSection, setActiveSection] = useState('');
  const [menuNoticeText, setMenuNoticeText] = useState('');
  const [savingNotice, setSavingNotice] = useState(false);
  const [categoryTimings, setCategoryTimings] = useState({});
  const [savingCategoryTiming, setSavingCategoryTiming] = useState('');
  const { showAlert } = useAlert();

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    price: '',
    cost_price: '',
    menu_type: MENU_CATEGORIES[0],
    custom_menu_type: '',
    is_available: true,
    today_special: false,
    today_special_start_at: '',
    today_special_end_at: '',
    image: null,
    image_url: '',
  });

  const fetchMenuItems = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsData, categoriesData, noticeData, timingData] = await Promise.all([
        apiRequest('/menu'),
        apiRequest('/menu/categories').catch(() => []),
        apiRequest('/menu/notice').catch(() => ({ notice: '' })),
        apiRequest('/menu/category-timings').catch(() => [])
      ]);

      if (!Array.isArray(itemsData)) {
        throw new Error('Invalid menu data received.');
      }

      setMenuItems(itemsData);
      const categorySet = new Set([...MENU_CATEGORIES, ...(Array.isArray(categoriesData) ? categoriesData : [])]);
      setAvailableCategories(Array.from(categorySet));
      setMenuNoticeText(String(noticeData?.notice || ''));

      const timingMap = {};
      (Array.isArray(timingData) ? timingData : []).forEach((row) => {
        const key = String(row?.category || '').toUpperCase().trim();
        if (!key) return;
        timingMap[key] = {
          is_enabled: Number(row?.is_enabled) === 1,
          start_time: String(row?.start_time || '').slice(0, 5),
          end_time: String(row?.end_time || '').slice(0, 5)
        };
      });
      setCategoryTimings(timingMap);
    } catch (error) {
      showAlert(`Could not load menu: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  const filteredItems = useMemo(() => {
    const q = String(searchTerm || '').trim().toLowerCase();
    if (!q) return menuItems;
    return (menuItems || []).filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const category = String(item.menu_type || '').toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [menuItems, searchTerm]);

  const groupedMenuItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const category = item.menu_type || 'REGULAR';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const sectionCategories = useMemo(
    () => Object.keys(groupedMenuItems).sort(),
    [groupedMenuItems]
  );

  useEffect(() => {
    if (!activeSection && sectionCategories.length > 0) {
      setActiveSection(sectionCategories[0]);
    }
  }, [activeSection, sectionCategories]);

  useEffect(() => {
    if (currentEditItem) {
      const categoryValue = currentEditItem.menu_type || MENU_CATEGORIES[0];
      const knownCategory = availableCategories.includes(categoryValue);

      setFormData({
        id: currentEditItem.id,
        name: currentEditItem.name,
        price: currentEditItem.price,
        cost_price: currentEditItem.cost_price,
        menu_type: knownCategory ? categoryValue : CUSTOM_CATEGORY_VALUE,
        custom_menu_type: knownCategory ? '' : categoryValue,
        is_available: Boolean(currentEditItem.is_available),
        today_special: Boolean(currentEditItem.today_special),
        today_special_start_at: toInputDateTime(currentEditItem.today_special_start_at),
        today_special_end_at: toInputDateTime(currentEditItem.today_special_end_at),
        image: null,
        image_url: currentEditItem.image ? `/${currentEditItem.image}` : '',
      });
    } else {
      setFormData({
        id: '',
        name: '',
        price: '',
        cost_price: '',
        menu_type: MENU_CATEGORIES[0],
        custom_menu_type: '',
        is_available: true,
        today_special: false,
        today_special_start_at: '',
        today_special_end_at: '',
        image: null,
        image_url: '',
      });
    }
  }, [currentEditItem, availableCategories]);

  const handleFormChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'file' ? files[0] : value),
    }));
  };

  const openAddModal = () => {
    setCurrentEditItem(null);
    setShowModal(true);
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Enter new category name (example: SOUTH INDIAN):', '');
    if (name === null) return;
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      showAlert('Category name is required.', 'error');
      return;
    }

    try {
      await apiRequest('/menu/categories', 'POST', { name: trimmed });
      showAlert('Category added successfully.', 'success');
      await fetchMenuItems();
    } catch (error) {
      showAlert(`Could not add category: ${error.message}`, 'error');
    }
  };

  const handleSaveMenuNotice = async () => {
    try {
      setSavingNotice(true);
      await apiRequest('/menu/notice', 'PUT', {
        notice: String(menuNoticeText || '').trim()
      });
      showAlert('Menu notice updated.', 'success');
    } catch (error) {
      showAlert(`Could not update menu notice: ${error.message}`, 'error');
    } finally {
      setSavingNotice(false);
    }
  };

  const updateCategoryTimingField = (category, field, value) => {
    const key = String(category || '').toUpperCase().trim();
    setCategoryTimings((prev) => ({
      ...prev,
      [key]: {
        is_enabled: Boolean(prev?.[key]?.is_enabled),
        start_time: String(prev?.[key]?.start_time || ''),
        end_time: String(prev?.[key]?.end_time || ''),
        [field]: value
      }
    }));
  };

  const saveCategoryTiming = async (category) => {
    const key = String(category || '').toUpperCase().trim();
    const current = categoryTimings?.[key] || {
      is_enabled: false,
      start_time: '',
      end_time: ''
    };

    const isTimeValid = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
    if (current.is_enabled) {
      if (!current.start_time || !current.end_time) {
        showAlert('Start and end time are required when timing is enabled.', 'error');
        return;
      }
      if (!isTimeValid(current.start_time) || !isTimeValid(current.end_time)) {
        showAlert('Please enter valid HH:MM time values.', 'error');
        return;
      }
    }

    try {
      setSavingCategoryTiming(key);
      await apiRequest(`/menu/category-timings/${key}`, 'PUT', {
        is_enabled: current.is_enabled ? 1 : 0,
        start_time: current.start_time || null,
        end_time: current.end_time || null
      });
      showAlert(`Timing updated for ${CATEGORY_DISPLAY_NAMES[key] || key}.`, 'success');
    } catch (error) {
      showAlert(`Could not save timing for ${CATEGORY_DISPLAY_NAMES[key] || key}: ${error.message}`, 'error');
    } finally {
      setSavingCategoryTiming('');
    }
  };

  const openEditModal = (item) => {
    setCurrentEditItem(item);
    setShowModal(true);
  };

  const closeMenuModal = () => {
    setShowModal(false);
    setCurrentEditItem(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const finalCategory = (formData.menu_type === CUSTOM_CATEGORY_VALUE
      ? formData.custom_menu_type
      : formData.menu_type
    ).trim();

    if (!finalCategory) {
      showAlert('Please select or enter a category.', 'error');
      return;
    }

    const itemData = new FormData();
    itemData.append('name', formData.name);
    itemData.append('price', parseFloat(formData.price));
    itemData.append('cost_price', parseFloat(formData.cost_price));
    itemData.append('menu_type', finalCategory);
    itemData.append('is_available', formData.is_available ? '1' : '0');
    itemData.append('today_special', formData.today_special ? '1' : '0');
    itemData.append('today_special_start_at', formData.today_special_start_at || '');
    itemData.append('today_special_end_at', formData.today_special_end_at || '');
    if (formData.image) {
      itemData.append('image', formData.image);
    }

    try {
      if (formData.id) {
        await apiRequest(`/menu/${formData.id}`, 'PUT', itemData);
        showAlert('Item updated!', 'success');
      } else {
        await apiRequest('/menu', 'POST', itemData);
        showAlert('Item added!', 'success');
      }
      closeMenuModal();
      fetchMenuItems();
    } catch (error) {
      showAlert(`Error saving item: ${error.message}`, 'error');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await apiRequest(`/menu/${itemId}`, 'DELETE');
        showAlert('Item deleted!', 'success');
        fetchMenuItems();
      } catch (error) {
        showAlert(`Error deleting item: ${error.message}`, 'error');
      }
    }
  };

  const handleAvailabilityToggle = async (itemId, currentStatus) => {
    const newStatus = currentStatus ? 0 : 1;
    // Optimistic Update
    setMenuItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, is_available: newStatus } : item
    ));

    try {
      await apiRequest(`/menu/${itemId}`, 'PUT', {
        is_available: newStatus,
      });
      showAlert(newStatus === 0 ? 'Item marked unavailable!' : 'Item marked available!', 'success');
    } catch (error) {
      // Revert on error
      setMenuItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, is_available: currentStatus } : item
      ));
      showAlert(`Error updating availability: ${error.message}`, 'error');
    }
  };

  const handleTodaySpecialToggle = async (itemId, currentStatus) => {
    const newStatus = currentStatus ? 0 : 1;
    // Optimistic Update
    setMenuItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, today_special: newStatus } : item
    ));

    try {
      await apiRequest(`/menu/${itemId}`, 'PUT', {
        today_special: newStatus,
      });
      showAlert(newStatus === 0 ? 'Removed from today special.' : 'Marked as today special!', 'success');
    } catch (error) {
      // Revert on error
      setMenuItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, today_special: currentStatus } : item
      ));
      showAlert(`Error updating today special: ${error.message}`, 'error');
    }
  };

  const persistCategoryOrder = async (category, nextItems) => {
    try {
      await apiRequest('/menu/reorder', 'PUT', {
        category,
        itemIds: nextItems.map((i) => i.id)
      });
    } catch (error) {
      showAlert(`Order saved locally but server sync failed: ${error.message}`, 'error');
    }
  };

  const handleDragStart = (e, item) => {
    if (String(searchTerm || '').trim()) {
      e.preventDefault();
      return;
    }
    const category = item.menu_type || 'REGULAR';
    const itemId = Number(item.id);
    setDraggedItemId(itemId);
    setDraggedCategory(category);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(itemId));
    e.dataTransfer.setData('application/x-dypcet-menu-category', String(category));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const getDraggedMeta = (e) => {
    const idFromTransfer = Number(e.dataTransfer.getData('text/plain'));
    const categoryFromTransfer = e.dataTransfer.getData('application/x-dypcet-menu-category');
    return {
      itemId: Number.isFinite(idFromTransfer) && idFromTransfer > 0 ? idFromTransfer : draggedItemId,
      category: categoryFromTransfer || draggedCategory
    };
  };

  const applyLocalOrder = (category, nextItems) => {
    setMenuItems((prev) => {
      const others = prev.filter((i) => (i.menu_type || 'REGULAR') !== category);
      return [...others, ...nextItems];
    });
  };

  const handleDrop = async (e, targetItem) => {
    e.preventDefault();
    const { itemId, category } = getDraggedMeta(e);
    const targetCategory = targetItem.menu_type || 'REGULAR';

    if (!itemId || !category || itemId === Number(targetItem.id)) {
      setDraggedItemId(null);
      setDraggedCategory(null);
      return;
    }

    const sourceItems = (groupedMenuItems[category] || []).slice();
    const targetItems = category === targetCategory
      ? sourceItems
      : (groupedMenuItems[targetCategory] || []).slice();
    const fromIndex = sourceItems.findIndex((i) => Number(i.id) === Number(itemId));
    const toIndex = targetItems.findIndex((i) => Number(i.id) === Number(targetItem.id));

    if (fromIndex < 0 || toIndex < 0) {
      setDraggedItemId(null);
      setDraggedCategory(null);
      return;
    }

    const [moved] = sourceItems.splice(fromIndex, 1);

    if (category === targetCategory) {
      sourceItems.splice(toIndex, 0, moved);
      applyLocalOrder(category, sourceItems);
      await persistCategoryOrder(category, sourceItems);
      showAlert('Item position updated!', 'success');
    } else {
      const movedWithNewCategory = { ...moved, menu_type: targetCategory };
      targetItems.splice(toIndex, 0, movedWithNewCategory);

      // Optimistic local update for both categories.
      setMenuItems((prev) => {
        return prev
          .map((i) => (Number(i.id) === Number(itemId) ? { ...i, menu_type: targetCategory } : i))
          .sort((a, b) => {
            const ca = String(a.menu_type || '').localeCompare(String(b.menu_type || ''));
            if (ca !== 0) return ca;
            return Number(a.display_order || 0) - Number(b.display_order || 0);
          });
      });

      // Persist category move first, then order sync in both source and target categories.
      await apiRequest(`/menu/${itemId}`, 'PUT', { menu_type: targetCategory });
      await persistCategoryOrder(targetCategory, targetItems);
      if (sourceItems.length > 0) {
        await persistCategoryOrder(category, sourceItems);
      }
      showAlert(`Item moved to ${CATEGORY_DISPLAY_NAMES[targetCategory] || targetCategory}.`, 'success');
      await fetchMenuItems();
    }

    setDraggedItemId(null);
    setDraggedCategory(null);
  };

  const handleDropToCategoryEnd = async (e, category) => {
    e.preventDefault();
    const { itemId, category: sourceCategory } = getDraggedMeta(e);

    if (!itemId || !sourceCategory) {
      setDraggedItemId(null);
      setDraggedCategory(null);
      return;
    }

    const sourceItems = (groupedMenuItems[sourceCategory] || []).slice();
    const targetItems = sourceCategory === category
      ? sourceItems
      : (groupedMenuItems[category] || []).slice();
    const fromIndex = sourceItems.findIndex((i) => Number(i.id) === Number(itemId));
    if (fromIndex < 0) {
      setDraggedItemId(null);
      setDraggedCategory(null);
      return;
    }

    const [moved] = sourceItems.splice(fromIndex, 1);

    if (sourceCategory === category) {
      targetItems.push(moved);
      applyLocalOrder(category, targetItems);
      await persistCategoryOrder(category, targetItems);
      showAlert('Item moved in category.', 'success');
    } else {
      const movedWithNewCategory = { ...moved, menu_type: category };
      targetItems.push(movedWithNewCategory);

      setMenuItems((prev) =>
        prev
          .map((i) => (Number(i.id) === Number(itemId) ? { ...i, menu_type: category } : i))
          .sort((a, b) => {
            const ca = String(a.menu_type || '').localeCompare(String(b.menu_type || ''));
            if (ca !== 0) return ca;
            return Number(a.display_order || 0) - Number(b.display_order || 0);
          })
      );

      await apiRequest(`/menu/${itemId}`, 'PUT', { menu_type: category });
      await persistCategoryOrder(category, targetItems);
      if (sourceItems.length > 0) {
        await persistCategoryOrder(sourceCategory, sourceItems);
      }
      showAlert(`Item moved to ${CATEGORY_DISPLAY_NAMES[category] || category}.`, 'success');
      await fetchMenuItems();
    }

    setDraggedItemId(null);
    setDraggedCategory(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDraggedCategory(null);
  };

  const jumpToSection = (category) => {
    setActiveSection(category);
    const el = document.getElementById(`admin-category-${category}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return <div className="loader">Loading Menu...</div>;
  }

  return (
    <div className="admin-menu-page">
      <div className="admin-menu-header">
        <h3>Food Item Management</h3>
        <div className="admin-menu-header-tools">
          <input
            type="text"
            className="admin-menu-search"
            placeholder="Search item or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="button btn-add-item" onClick={handleAddCategory}>+ Add Category</button>
          <button className="button btn-add-item" onClick={openAddModal}>+ Add New Item</button>
        </div>
      </div>

      <div className="menu-notice-admin-card">
        <label htmlFor="menuNoticeText">Menu Notice (Shown on user menu page)</label>
        <div className="menu-notice-admin-row">
          <textarea
            id="menuNoticeText"
            rows="2"
            maxLength="600"
            value={menuNoticeText}
            onChange={(e) => setMenuNoticeText(e.target.value)}
            placeholder="Example: Dinner and many menu items are available only after 12:00 PM."
          />
          <button className="button" onClick={handleSaveMenuNotice} disabled={savingNotice}>
            {savingNotice ? 'Saving...' : 'Save Notice'}
          </button>
        </div>
      </div>

      <div className="menu-notice-admin-card">
        <label>Section Timings (Admin Controlled)</label>
        <div className="category-timings-admin-list">
          {availableCategories
            .slice()
            .sort((a, b) => String(a).localeCompare(String(b)))
            .map((category) => {
              const key = String(category || '').toUpperCase().trim();
              const current = categoryTimings?.[key] || {
                is_enabled: false,
                start_time: '',
                end_time: ''
              };
              return (
                <div key={`timing-${key}`} className="category-timing-row">
                  <div className="category-timing-name">{CATEGORY_DISPLAY_NAMES[key] || key.replace(/_/g, ' ')}</div>
                  <label className="category-timing-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(current.is_enabled)}
                      onChange={(e) => updateCategoryTimingField(key, 'is_enabled', e.target.checked)}
                    />
                    Enable
                  </label>
                  <input
                    type="time"
                    value={current.start_time || ''}
                    onChange={(e) => updateCategoryTimingField(key, 'start_time', e.target.value)}
                    disabled={!current.is_enabled}
                  />
                  <input
                    type="time"
                    value={current.end_time || ''}
                    onChange={(e) => updateCategoryTimingField(key, 'end_time', e.target.value)}
                    disabled={!current.is_enabled}
                  />
                  <button
                    className="button-small"
                    onClick={() => saveCategoryTiming(key)}
                    disabled={savingCategoryTiming === key}
                  >
                    {savingCategoryTiming === key ? 'Saving...' : 'Save'}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {String(searchTerm || '').trim() && (
        <p className="admin-menu-search-note">
          Showing filtered results for: <strong>{searchTerm}</strong>. Clear search to enable drag-drop reordering.
        </p>
      )}

      {Object.keys(groupedMenuItems).length === 0 ? (
        <p className="no-items">No menu items found{String(searchTerm || '').trim() ? ' for this search.' : '.'}</p>
      ) : (
        <div className="admin-menu-layout">
          <aside className="admin-menu-sections-sidebar">
            <h4>Sections</h4>
            {sectionCategories.map((category) => (
              <button
                key={`admin-section-${category}`}
                type="button"
                className={`admin-section-btn ${activeSection === category ? 'active' : ''}`}
                onClick={() => jumpToSection(category)}
              >
                {CATEGORY_DISPLAY_NAMES[category] || category.replace(/_/g, ' ')}
              </button>
            ))}
          </aside>

          <div className="menu-categories-grid">
            {Object.entries(groupedMenuItems).map(([category, items]) => (
              <div key={category} id={`admin-category-${category}`} className="category-container">
                <div className="category-header-admin">
                  <h4>{CATEGORY_DISPLAY_NAMES[category] || category.replace(/_/g, ' ')}</h4>
                  <span className="item-badge">{items.length}</span>
                </div>
                <div
                  className="menu-items-list"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropToCategoryEnd(e, category)}
                >
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`menu-item-row ${!item.is_available ? 'unavailable' : ''}`}
                      draggable={!String(searchTerm || '').trim()}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, item)}
                    >
                      <div className="drag-handle">::</div>
                      <div className="item-image-small">
                        {item.image && !String(item.image).includes('default-food') ? (
                          <img src={`/${item.image}`} alt={item.name} />
                        ) : (
                          <div className="item-image-fallback">{item.name}</div>
                        )}
                      </div>
                      <div className="item-info">
                        <h5>{item.name}</h5>
                        <p className="item-price">INR {(item.price || 0).toFixed(2)}</p>
                      </div>
                      <div className="item-flags">
                        <button
                          className={`availability-btn ${item.is_available ? 'available' : 'unavailable'}`}
                          onClick={() => handleAvailabilityToggle(item.id, item.is_available)}
                          title={item.is_available ? 'Click to mark unavailable' : 'Click to mark available'}
                        >
                          <span>{item.is_available ? 'Available' : 'Unavailable'}</span>
                        </button>
                        <button
                          className={`special-btn ${item.today_special ? 'special-on' : 'special-off'}`}
                          onClick={() => handleTodaySpecialToggle(item.id, item.today_special)}
                          title={item.today_special ? 'Remove from today special' : 'Mark as today special'}
                        >
                          {item.today_special ? 'Today Special' : 'Set Today Special'}
                        </button>
                        {item.today_special_start_at && item.today_special_end_at && (
                          <small className="special-schedule-chip">
                            Scheduled
                          </small>
                        )}
                      </div>
                      <div className="item-actions">
                        <button
                          className="button-small edit-btn"
                          onClick={() => openEditModal(item)}
                          title="Edit item"
                        >
                          Edit
                        </button>
                        <button
                          className="button-small danger-btn"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Delete item"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={closeMenuModal}>&times;</span>
            <h4>{currentEditItem ? 'Edit Item' : 'Add New Item'}</h4>
            <form id="menu-item-form" onSubmit={handleFormSubmit}>
              <input type="hidden" name="id" value={formData.id} />

              <div className="input-group">
                <label htmlFor="name">Item Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleFormChange} required />
              </div>
              <div className="input-group">
                <label htmlFor="price">Price (INR)</label>
                <input type="number" name="price" value={formData.price} onChange={handleFormChange} step="0.01" required />
              </div>
              <div className="input-group">
                <label htmlFor="cost_price">Cost Price (INR)</label>
                <input type="number" name="cost_price" value={formData.cost_price} onChange={handleFormChange} step="0.01" required />
              </div>
              <div className="input-group">
                <label htmlFor="menu_type">Category</label>
                <select name="menu_type" value={formData.menu_type} onChange={handleFormChange}>
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_DISPLAY_NAMES[category] || category.replace(/_/g, ' ')}
                    </option>
                  ))}
                  <option value={CUSTOM_CATEGORY_VALUE}>Add New Category</option>
                </select>
              </div>

              {formData.menu_type === CUSTOM_CATEGORY_VALUE && (
                <div className="input-group">
                  <label htmlFor="custom_menu_type">New Category Name</label>
                  <input
                    type="text"
                    name="custom_menu_type"
                    value={formData.custom_menu_type}
                    onChange={handleFormChange}
                    placeholder="Example: SOUTH_INDIAN"
                    required
                  />
                </div>
              )}

              <div className="input-group checkbox-group">
                <input type="checkbox" name="is_available" checked={formData.is_available} onChange={handleFormChange} id="is_available" />
                <label htmlFor="is_available">Available for Order</label>
              </div>
              <div className="input-group checkbox-group">
                <input type="checkbox" name="today_special" checked={formData.today_special} onChange={handleFormChange} id="today_special" />
                <label htmlFor="today_special">Mark as Today Special</label>
              </div>
              <div className="input-group">
                <label htmlFor="today_special_start_at">Special Start (optional)</label>
                <input
                  type="datetime-local"
                  name="today_special_start_at"
                  value={formData.today_special_start_at}
                  onChange={handleFormChange}
                />
              </div>
              <div className="input-group">
                <label htmlFor="today_special_end_at">Special End (optional)</label>
                <input
                  type="datetime-local"
                  name="today_special_end_at"
                  value={formData.today_special_end_at}
                  onChange={handleFormChange}
                />
              </div>
              <div className="input-group">
                <label htmlFor="image">Image</label>
                <input type="file" name="image" accept="image/*" onChange={handleFormChange} />
                {formData.image_url && (
                  <img src={formData.image_url} alt="Current Item" className="admin-item-image-preview" />
                )}
              </div>
              <button type="submit" className="button">Save Item</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminMenuPage;
