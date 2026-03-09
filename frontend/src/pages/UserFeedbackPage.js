import React, { useState } from 'react';
import { useAlert } from '../hooks/useAlert'; // Assuming useAlert is in hooks

const UserFeedbackPage = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const { showAlert } = useAlert();

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real application, you would send this data to your backend
    console.log('Feedback Submitted:', { subject, message });
    showAlert('Thank you for your feedback!', 'success');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="feedback-container">
      <h2>Submit Feedback</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="subject">Subject</label>
          <input
            type="text"
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows="5"
            required
          ></textarea>
        </div>
        <button type="submit" className="btn btn-primary">Submit Feedback</button>
      </form>
    </div>
  );
};

export default UserFeedbackPage;
