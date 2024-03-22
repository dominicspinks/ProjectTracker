import { useState, useEffect, useMemo } from 'react';

import { supabaseClient } from '../../config/supabase-client';

// API
import * as MessageAPI from '../../utilities/messages-api';
import * as ProjectAPI from '../../utilities/project-api';

// contexts
import { useAuth } from '../../contexts/AuthProvider';

// Components
import ChatMessage from '../ChatMessage/ChatMessage';

// Icons
import {
	ChatBubbleLeftRightIcon,
	PaperAirplaneIcon,
	ChevronDownIcon,
} from '@heroicons/react/24/outline';

export default function ChatContainer({ projectNames }) {
	// console.log(projectNames);
	const { user } = useAuth();

	const [showMessages, setShowMessages] = useState(false);
	const [unreadMessages, setUnreadMessages] = useState(new Set());

	const [messages, setMessages] = useState([]);
	const [filteredMessages, setFilteredMessages] = useState([]);
	const [loadingMessages, setLoadingMessages] = useState(true);

	const [incomingMessage, setIncomingMessage] = useState(null);

	const [fieldProjectId, setFieldProjectId] = useState(
		projectNames.length > 0 ? projectNames[0].id : ''
	);
	const [fieldMessage, setFieldMessage] = useState('');
	const [projectMembers, setProjectMembers] = useState(new Map());

	// To do, listen only for changes to specific projects, when the project changes, the listener will be closed and a new one opened. This will reduce memory requirements, but means new message alerts wont work for projects not selected (this will require a second listenter)
	useEffect(() => {
		// Get initial messages list
		getMessages();

		// Listen for changes in the messages table
		const subscription = supabaseClient
			.channel('messagesTable')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'message',
				},
				handleMessageSubscription
			)
			.subscribe();

		return () => supabaseClient.removeChannel(subscription);
	}, []);

	// Handle incoming messages
	useMemo(() => {
		if (!incomingMessage) return;

		setMessages([incomingMessage, ...messages]);
		setIncomingMessage(null);

		// Flag that the user has unread messages for their projects
		if (
			projectNames?.find(
				(project) => project.id === incomingMessage.project_id
			) &&
			(!showMessages ||
				(showMessages &&
					fieldProjectId !== incomingMessage.project_id)) &&
			!unreadMessages.has(incomingMessage.project_id)
		) {
			const newUnreadMessages = new Set(unreadMessages);
			newUnreadMessages.add(incomingMessage.project_id);
			setUnreadMessages(newUnreadMessages);
		}
	}, [incomingMessage]);

	// Update default fieldProjectId value if projectNames changes
	useMemo(() => {
		if (projectNames.length === 0) return;

		setFieldProjectId(projectNames[0].id);
		getProjectMembers();
		getMessages();
	}, [projectNames]);

	// Filter the messages by the new fieldProjectId
	useMemo(() => {
		if (fieldProjectId) {
			filterByProjectId(messages);
		}
	}, [fieldProjectId]);

	// Update project members and filtered list when messages change
	useMemo(() => {
		if (messages.length === 0 || loadingMessages) return;

		const newMessage = messages[0];
		// check if the new message was created by a new user
		// If there are any new members, reload the project member details
		if (
			!projectMembers ||
			!projectMembers.size ||
			!projectMembers.has(newMessage.user_id)
		)
			getProjectMembers();

		// Add the new message to the filtered message if it was created for the current project and doesn't already exist
		if (
			newMessage.project_id === fieldProjectId &&
			!filteredMessages.includes(newMessage)
		) {
			const newFilteredMessages = [newMessage, ...filteredMessages];
			setFilteredMessages(newFilteredMessages);
		}
	}, [messages]);

	// Function to run when a new message arrives from the db
	function handleMessageSubscription(payload) {
		// If a new line was created, add it to the list
		if (payload.eventType === 'INSERT') {
			setIncomingMessage(payload.new);
		}
	}

	// Get list of users belonging to the current list of projects
	async function getProjectMembers() {
		if (projectNames.length === 0) return;

		const { data, error } = await ProjectAPI.getProjectMembers(
			projectNames.map((project) => project.id)
		);

		if (error) {
			console.error(error);
			return { error: error };
		}

		setProjectMembers(data);
	}

	// Get existing messages for the user's projects
	async function getMessages() {
		console.log('getMessages');
		if (projectNames.length === 0 || !user || !loadingMessages) return;
		const { data, error } = await MessageAPI.getMessages(projectNames);
		if (error) {
			console.error(error);
			return { error: error };
		}
		setMessages(data);
		console.log('get messages', typeof data, data);

		// Filter messages by the selected project
		filterByProjectId(data);
		setLoadingMessages(false);
	}

	function filterByProjectId(data) {
		// Filter messages by the selected project
		console.log('filter by project id', data);
		setFilteredMessages([
			...data.filter(
				(message) => message.project_id === parseInt(fieldProjectId)
			),
		]);
		console.log('filtered messages', filteredMessages);
	}

	async function sendMessage(e) {
		e.preventDefault();

		// Clean new lines from input
		if (fieldMessage.trim() === '') {
			setFieldMessage('');
		}

		// Don't send an empty message
		if (
			!fieldProjectId ||
			fieldProjectId === '' ||
			!fieldMessage ||
			fieldMessage.trim() === ''
		)
			return;

		// Send the message
		const { error } = await MessageAPI.sendMessage(
			user.id,
			fieldProjectId,
			fieldMessage.trim()
		);

		if (error) {
			console.error(error);
			return { error: error };
		}
		setFieldMessage('');
	}

	function handleMessageChange(e) {
		setFieldMessage(e.target.value);
	}

	function handleProjectChange(e) {
		setFieldProjectId(parseInt(e.target.value));
		// Remove the unread message indicator for the current project
		unreadMessages.delete(parseInt(e.target.value));
		setUnreadMessages(new Set(unreadMessages));
	}

	function toggleMessages() {
		setShowMessages(!showMessages);
		// Remove the unread message indicator for the current project
		unreadMessages.delete(fieldProjectId);
		setUnreadMessages(new Set(unreadMessages));
	}

	return (
		<>
			<div
				id='messagesContainer'
				className={`absolute bottom-0 right-0 m-3 flex flex-col flex-end transition ease-in-out delay-150 ${
					!showMessages ? 'w-16 h-16' : 'w-96'
				} ${
					!showMessages && unreadMessages.size > 0
						? 'animate-bounce'
						: ''
				}`}>
				<div
					className={`bg-slate-200 flex gap-2 justify-between align-middle p-2 h-16 transition ease-in-out delay-150 ${
						!showMessages ? 'rounded-full ' : ' rounded-t-lg'
					}`}>
					<div
						onClick={toggleMessages}
						className='flex gap-0 items-center'>
						<ChatBubbleLeftRightIcon
							className={`text-slate-800 w-10 h-10 cursor-pointer ${
								showMessages && unreadMessages.size > 0
									? 'animate-bounce'
									: ''
							}`}
						/>
						{showMessages && (
							<ChevronDownIcon
								className={`text-slate-800 w-6 h-6 cursor-pointer ${
									!showMessages && 'hidden'
								}`}
							/>
						)}
					</div>
					<select
						id='projectSelector'
						value={fieldProjectId}
						onChange={handleProjectChange}
						className={`transition ease-in-out delay-150 ${
							!showMessages ? 'hidden' : ''
						}`}>
						{projectNames.map((project) => (
							<option
								key={project.id}
								value={parseInt(project.id)}
								className={
									unreadMessages.has(project.id)
										? 'italic'
										: ''
								}>
								{project.name}
								{unreadMessages.has(project.id) && ' ✉️'}
							</option>
						))}
					</select>
				</div>
				<div
					id='messages'
					className={`transition ease-in-out delay-150 ${
						!showMessages ? 'hidden' : ''
					}`}>
					<div
						id='messageList'
						className='flex flex-col-reverse overflow-y-scroll gap-2 p-2 max-h-72 min-h-36 overscroll-contain max-w-96 bg-slate-400 border-2 border-slate-200'>
						{filteredMessages.length === 0 && <p>No messages</p>}
						{filteredMessages.map((message) => (
							<ChatMessage
								key={message.id}
								message={message}
								projectMembers={projectMembers}
							/>
						))}
					</div>
					<form
						id='messageInput'
						onSubmit={sendMessage}
						className='flex gap-2 justify-around items-end p-2 bg-slate-200 rounded-bl-lg'>
						<textarea
							value={fieldMessage}
							onChange={handleMessageChange}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									sendMessage(e);
									e.target.style.height = '2.5rem';
								}
							}}
							onInput={(e) => {
								console.log(e.target.scrollHeight);
								e.target.style.height = '2.5rem';
								e.target.style.height =
									e.target.scrollHeight + 'px';
							}}
							placeholder='Type a message...'
							className='input-box outline-none p-2 min-h-10 transition h-10 w-5/6 border-none border-slate-400 rounded-lg bg-sky-950 text-start align-bottom resize-none'
						/>
						<button type='submit'>
							<PaperAirplaneIcon className='text-slate-800 w-10 h-10 hover:text-slate-400' />
						</button>
					</form>
				</div>
			</div>
		</>
	);
}
