import React, { useCallback, useEffect, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../hooks/useAlert';
import { useNavigate } from 'react-router-dom';
import FacultyAccessDenied from './FacultyAccessDenied';
import '../admin/FacultyPanel.css';

function FacultyPanelPage() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [notices, setNotices] = useState([]);
  const [committeeEditMembers, setCommitteeEditMembers] = useState([]);
  const [newCommitteeMember, setNewCommitteeMember] = useState({
    sr_no: '',
    name: '',
    department: '',
    role: ''
  });

  const [feedbackResponses, setFeedbackResponses] = useState({});
  const [respondingFeedbackId, setRespondingFeedbackId] = useState(null);
  const [savingCommitteeId, setSavingCommitteeId] = useState(null);
  const [addingCommitteeMember, setAddingCommitteeMember] = useState(false);
  const [removingCommitteeId, setRemovingCommitteeId] = useState(null);

  const [noticeFormData, setNoticeFormData] = useState({ title: '', content: '', image: null });
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);

  // Check if user is a canteen committee member (email contains @member.com)
  const isCanteenCoordinator = user?.email?.endsWith('@member.com');
  const isFacultyCoordinator = user?.user_type === 'faculty';
  const hasPanelAccess = isCanteenCoordinator || isFacultyCoordinator;

  useEffect(() => {
    if (!hasPanelAccess) {
      showAlert('You do not have access to this panel. Only canteen committee members can access this panel.', 'error');
      navigate('/');
    }
  }, [hasPanelAccess, navigate, showAlert]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiRequest('/users/faculty');
      if (!Array.isArray(data)) {
        throw new Error('Invalid user data received.');
      }
      setUsers(data);
    } catch (error) {
      showAlert(`Could not load users: ${error.message}`, 'error');
    }
  }, [showAlert]);

  const fetchFeedbacks = useCallback(async () => {
    try {
      const data = await apiRequest('/feedback/faculty');
      if (!Array.isArray(data)) {
        throw new Error('Invalid feedback data received.');
      }
      setFeedbacks(data);
    } catch (error) {
      showAlert(`Could not load feedbacks: ${error.message}`, 'error');
    }
  }, [showAlert]);

  const fetchNotices = useCallback(async () => {
    try {
      let data;
      try {
        data = await apiRequest('/notices/committee');
      } catch (primaryError) {
        // Backward-compatible fallback if server route is still on /faculty.
        data = await apiRequest('/notices/faculty');
      }

      if (!Array.isArray(data)) {
        const message = data && typeof data === 'object' && data.message
          ? data.message
          : 'Invalid notices data received.';
        throw new Error(message);
      }

      setNotices(data);
    } catch (error) {
      showAlert(`Could not load notices: ${error.message}`, 'error');
    }
  }, [showAlert]);

  const fetchCommitteeMembers = useCallback(async () => {
    try {
      const data = await apiRequest('/committee/manage');
      if (!Array.isArray(data)) {
        throw new Error('Invalid committee member data received.');
      }
      setCommitteeEditMembers(data);
    } catch (error) {
      showAlert(`Could not load committee members: ${error.message}`, 'error');
    }
  }, [showAlert]);

  const handleFeedbackResponseChange = (feedbackId, value) => {
    setFeedbackResponses((prev) => ({
      ...prev,
      [feedbackId]: value
    }));
  };

  const handleFeedbackResponseSubmit = async (feedbackId) => {
    const responseText = (feedbackResponses[feedbackId] || '').trim();
    if (!responseText) {
      showAlert('Response cannot be empty.', 'error');
      return;
    }

    try {
      setRespondingFeedbackId(feedbackId);
      await apiRequest(`/feedback/${feedbackId}`, 'PUT', { adminResponse: responseText });
      showAlert('Response submitted successfully.', 'success');
      setFeedbackResponses((prev) => ({ ...prev, [feedbackId]: '' }));
      await fetchFeedbacks();
    } catch (error) {
      showAlert(`Could not submit response: ${error.message}`, 'error');
    } finally {
      setRespondingFeedbackId(null);
    }
  };

  const handleNoticeInputChange = (e) => {
    const { name, value, files } = e.target;
    setNoticeFormData((prev) => ({
      ...prev,
      [name]: name === 'image' ? (files && files[0] ? files[0] : null) : value
    }));
  };

  const handleNoticeSubmit = async (e) => {
    e.preventDefault();
    const title = noticeFormData.title.trim();
    const content = noticeFormData.content.trim();

    if (!title || !content) {
      showAlert('Notice title and content are required.', 'error');
      return;
    }

    try {
      setNoticeSubmitting(true);
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      if (noticeFormData.image) {
        formData.append('image', noticeFormData.image);
      }

      await apiRequest('/notices', 'POST', formData);
      showAlert('Notice published successfully.', 'success');
      setNoticeFormData({ title: '', content: '', image: null });
      await fetchNotices();
    } catch (error) {
      showAlert(`Could not publish notice: ${error.message}`, 'error');
    } finally {
      setNoticeSubmitting(false);
    }
  };

  const handleCommitteeFieldChange = (id, field, value) => {
    setCommitteeEditMembers((prev) =>
      prev.map((member) =>
        Number(member.id) === Number(id)
          ? { ...member, [field]: field === 'sr_no' ? Number(value) : value }
          : member
      )
    );
  };

  const saveCommitteeMember = async (member) => {
    try {
      setSavingCommitteeId(member.id);
      await apiRequest(`/committee/${member.id}`, 'PUT', {
        sr_no: Number(member.sr_no),
        name: String(member.name || '').trim(),
        department: String(member.department || '').trim(),
        role: String(member.role || '').trim(),
        is_active: member.is_active ? 1 : 0
      });
      showAlert('Committee member updated successfully.', 'success');
      await fetchCommitteeMembers();
    } catch (error) {
      showAlert(`Could not update committee member: ${error.message}`, 'error');
    } finally {
      setSavingCommitteeId(null);
    }
  };

  const handleNewCommitteeFieldChange = (field, value) => {
    setNewCommitteeMember((prev) => ({
      ...prev,
      [field]: field === 'sr_no' ? value.replace(/[^\d]/g, '') : value
    }));
  };

  const addCommitteeMember = async () => {
    const payload = {
      sr_no: Number(newCommitteeMember.sr_no),
      name: String(newCommitteeMember.name || '').trim(),
      department: String(newCommitteeMember.department || '').trim(),
      role: String(newCommitteeMember.role || '').trim()
    };

    if (!payload.sr_no || !payload.name || !payload.department || !payload.role) {
      showAlert('Please fill all fields to add a committee member.', 'error');
      return;
    }

    try {
      setAddingCommitteeMember(true);
      await apiRequest('/committee', 'POST', payload);
      showAlert('Committee member added successfully.', 'success');
      setNewCommitteeMember({ sr_no: '', name: '', department: '', role: '' });
      await fetchCommitteeMembers();
    } catch (error) {
      showAlert(`Could not add committee member: ${error.message}`, 'error');
    } finally {
      setAddingCommitteeMember(false);
    }
  };

  const removeCommitteeMember = async (id) => {
    try {
      setRemovingCommitteeId(id);
      await apiRequest(`/committee/${id}`, 'DELETE');
      showAlert('Committee member removed successfully.', 'success');
      await fetchCommitteeMembers();
    } catch (error) {
      showAlert(`Could not remove committee member: ${error.message}`, 'error');
    } finally {
      setRemovingCommitteeId(null);
    }
  };

  useEffect(() => {
    if (!hasPanelAccess) return;

    let isMounted = true;
    const loadTabData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'users') {
          await fetchUsers();
        } else if (activeTab === 'feedbacks') {
          await fetchFeedbacks();
        } else if (activeTab === 'committee') {
          await fetchCommitteeMembers();
        } else {
          await fetchNotices();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTabData();
    return () => {
      isMounted = false;
    };
  }, [activeTab, hasPanelAccess, fetchCommitteeMembers, fetchFeedbacks, fetchNotices, fetchUsers]);

  if (!hasPanelAccess) {
    return <FacultyAccessDenied />;
  }

  if (loading) {
    return <div className="loader">Loading...</div>;
  }

  return (
    <div className="faculty-panel">
      <div className="panel-header">
        <h2>Canteen Committee Panel</h2>
        <p>Manage users, feedback, and notices</p>
      </div>

      <div className="faculty-tabs">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          All Users
        </button>
        <button className={`tab-btn ${activeTab === 'feedbacks' ? 'active' : ''}`} onClick={() => setActiveTab('feedbacks')}>
          Feedbacks
        </button>
        {isFacultyCoordinator && (
          <button className={`tab-btn ${activeTab === 'committee' ? 'active' : ''}`} onClick={() => setActiveTab('committee')}>
            Committee
          </button>
        )}
        <button className={`tab-btn ${activeTab === 'notices' ? 'active' : ''}`} onClick={() => setActiveTab('notices')}>
          Notices
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'users' && (
          <div className="users-section">
            <h3>Student and User Information</h3>
            {users.length === 0 ? (
              <p className="no-data">No users found.</p>
            ) : (
              <div className="table-wrapper">
                <table className="faculty-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Mobile</th>
                      <th>Student ID</th>
                      <th>Address</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((listUser) => (
                      <tr key={listUser.id}>
                        <td>{listUser.id}</td>
                        <td>{listUser.name}</td>
                        <td>{listUser.email}</td>
                        <td>{listUser.mobile_no || '-'}</td>
                        <td>{listUser.student_id || '-'}</td>
                        <td>{listUser.address || '-'}</td>
                        <td><span className="badge">{listUser.user_type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedbacks' && (
          <div className="feedbacks-section">
            <h3>Student Feedbacks</h3>
            {feedbacks.length === 0 ? (
              <p className="no-data">No feedbacks found.</p>
            ) : (
              <div className="feedbacks-grid">
                {feedbacks.map((feedback) => (
                  <div key={feedback.id} className="feedback-card">
                    <div className="feedback-header">
                      <h4>{feedback.subject}</h4>
                      <span className={`feedback-status ${feedback.status || 'pending'}`}>
                        {feedback.status || 'Pending'}
                      </span>
                    </div>
                    <div className="feedback-body">
                      <p><strong>User:</strong> {feedback.user_name || 'Anonymous'}</p>
                      <p><strong>Email:</strong> {feedback.user_email || '-'}</p>
                      <p><strong>Message:</strong></p>
                      <p className="feedback-message">{feedback.message}</p>

                      {feedback.admin_response ? (
                        <div className="feedback-response">
                          <p><strong>Response:</strong></p>
                          <p>{feedback.admin_response}</p>
                        </div>
                      ) : (
                        <div className="feedback-response-form">
                          <p><strong>Respond:</strong></p>
                          <textarea
                            rows="3"
                            placeholder="Write response for user..."
                            value={feedbackResponses[feedback.id] || ''}
                            onChange={(e) => handleFeedbackResponseChange(feedback.id, e.target.value)}
                          />
                          <button
                            type="button"
                            className="button button-small"
                            disabled={respondingFeedbackId === feedback.id}
                            onClick={() => handleFeedbackResponseSubmit(feedback.id)}
                          >
                            {respondingFeedbackId === feedback.id ? 'Submitting...' : 'Submit Response'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="feedback-footer">
                      <small>Submitted: {new Date(feedback.created_at).toLocaleDateString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notices' && (
          <div className="notices-section">
            <h3>Notice Section</h3>

            <form className="notice-form" onSubmit={handleNoticeSubmit}>
              <div className="input-group">
                <label htmlFor="notice-title">Notice Title</label>
                <input
                  id="notice-title"
                  name="title"
                  type="text"
                  value={noticeFormData.title}
                  onChange={handleNoticeInputChange}
                  maxLength={200}
                  placeholder="Enter short notice title"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="notice-content">Notice Content</label>
                <textarea
                  id="notice-content"
                  name="content"
                  rows="4"
                  value={noticeFormData.content}
                  onChange={handleNoticeInputChange}
                  placeholder="Write your notice for students and website visitors..."
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="notice-image">Notice Image (optional)</label>
                <input
                  id="notice-image"
                  name="image"
                  type="file"
                  accept="image/*"
                  onChange={handleNoticeInputChange}
                />
              </div>

              <button type="submit" className="button" disabled={noticeSubmitting}>
                {noticeSubmitting ? 'Publishing...' : 'Publish Notice'}
              </button>
            </form>

            <div className="notice-list">
              {notices.length === 0 ? (
                <p className="no-data">No notices published yet.</p>
              ) : (
                notices.map((notice) => (
                  <article key={notice.id} className="notice-card">
                    <h4>{notice.title}</h4>
                    {notice.image && (
                      <img
                        src={`/${notice.image}`}
                        alt={notice.title}
                        className="notice-image"
                      />
                    )}
                    <p>{notice.content}</p>
                    <small>Published: {new Date(notice.created_at).toLocaleString()}</small>
                  </article>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'committee' && isFacultyCoordinator && (
          <div className="committee-manage-section">
            <h3>Manage Canteen Committee (Faculty Coordinator Only)</h3>
            <div className="committee-add-form">
              <input
                type="number"
                min="1"
                placeholder="Sr. No."
                value={newCommitteeMember.sr_no}
                onChange={(e) => handleNewCommitteeFieldChange('sr_no', e.target.value)}
              />
              <input
                type="text"
                placeholder="Name"
                value={newCommitteeMember.name}
                onChange={(e) => handleNewCommitteeFieldChange('name', e.target.value)}
              />
              <input
                type="text"
                placeholder="Department"
                value={newCommitteeMember.department}
                onChange={(e) => handleNewCommitteeFieldChange('department', e.target.value)}
              />
              <input
                type="text"
                placeholder="Role"
                value={newCommitteeMember.role}
                onChange={(e) => handleNewCommitteeFieldChange('role', e.target.value)}
              />
              <button
                type="button"
                className="button button-small"
                disabled={addingCommitteeMember}
                onClick={addCommitteeMember}
              >
                {addingCommitteeMember ? 'Adding...' : 'Add Member'}
              </button>
            </div>
            {committeeEditMembers.length === 0 ? (
              <p className="no-data">No committee members found.</p>
            ) : (
              <div className="committee-manage-table-wrap">
                <table className="committee-manage-table">
                  <thead>
                    <tr>
                      <th>Sr. No.</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {committeeEditMembers.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={member.sr_no || 1}
                            onChange={(e) => handleCommitteeFieldChange(member.id, 'sr_no', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={member.name || ''}
                            onChange={(e) => handleCommitteeFieldChange(member.id, 'name', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={member.department || ''}
                            onChange={(e) => handleCommitteeFieldChange(member.id, 'department', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={member.role || ''}
                            onChange={(e) => handleCommitteeFieldChange(member.id, 'role', e.target.value)}
                          />
                        </td>
                        <td>
                          <div className="committee-action-buttons">
                            <button
                              type="button"
                              className="button button-small"
                              disabled={savingCommitteeId === member.id}
                              onClick={() => saveCommitteeMember(member)}
                            >
                              {savingCommitteeId === member.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="button button-small danger-btn"
                              disabled={removingCommitteeId === member.id}
                              onClick={() => removeCommitteeMember(member.id)}
                            >
                              {removingCommitteeId === member.id ? 'Removing...' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FacultyPanelPage;
