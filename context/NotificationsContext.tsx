'use client'
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { collection, onSnapshot, getDocs, query, where, QuerySnapshot } from 'firebase/firestore'
import { db } from '@/app/firebase'
import { fetchUserData } from '../utils/user/fetchUserData'
import { useSession } from 'next-auth/react'
import { updatedNotificationsProps } from '../types'

interface NotificationsProviderProps {
	children: ReactNode
}

interface NotificationsContextProps {
	notificationsData: updatedNotificationsProps[]
	activeNotifications: updatedNotificationsProps[]
	newFollows: number
	newComments: number
	newLikes: number
}

export const NotificationsContext = createContext<NotificationsContextProps | undefined>(undefined)

export function useNotifications() {
	const context = useContext(NotificationsContext)
	if (!context) {
		throw new Error('useNotifications must be used within a NotificationsProvider')
	}
	return context
}

export function NotificationsProvider({ children }: NotificationsProviderProps) {
	const [notificationsData, setNotificationsData] = useState<updatedNotificationsProps[]>([])
	const [activeNotifications, setActiveNotifications] = useState<updatedNotificationsProps[]>([])
	const [newFollows, setNewFollows] = useState(0)
	const [newComments, setNewComments] = useState(0)
	const [newLikes, setNewLikes] = useState(0)
	const [isInitialLoad, setIsInitialLoad] = useState(true)
	const session = useSession()
	const userId = session?.data?.user?.id

	const getAllNotifications = async () => {
		try {
			if (userId) {
				const notificationsRef = collection(db, 'users', userId, 'notifications')
				const notifications: updatedNotificationsProps[] = []
				const queryNotifications = query(notificationsRef)
				const notificationsSnap = await getDocs(queryNotifications)

				for (const notificationDoc of notificationsSnap.docs) {
					const notificationData = notificationDoc.data() as updatedNotificationsProps
					const userData = await fetchUserData(notificationData.addedBy)
					notificationData.id = notificationDoc.id
					if (userData) {
						notificationData.user = userData
						notifications.push(notificationData)
					}
				}

				setNotificationsData(notifications)
			}
		} catch (error) {
			console.error(error)
		} finally {
			setIsInitialLoad(false)
		}
	}

	useEffect(() => {
		getAllNotifications()
	}, [userId])

	useEffect(() => {
		const updatedActiveNotification = notificationsData.filter(notification => !notification.viewed)
		setNewComments(0)
		setNewLikes(0)
		setNewFollows(0)
		setActiveNotifications(updatedActiveNotification)

		updatedActiveNotification.forEach(notification => {
			if (notification.type === 'commentedYourPost') {
				setNewComments(prevComments => prevComments + 1)
			} else if (notification.type === 'likePost') {
				setNewLikes(prevLikes => prevLikes + 1)
			} else if (notification.type === 'followUser') {
				setNewFollows(prevFollows => prevFollows + 1)
			}
		})
	}, [notificationsData])

	useEffect(() => {
		if (userId && !isInitialLoad) {
			const unsubscribe = onSnapshot(
				query(collection(db, 'users', userId, 'notifications'), where('viewed', '==', false)),
				async (snapshot: QuerySnapshot) => {
					for (const change of snapshot.docChanges()) {
						if (change.type === 'added') {
							const newNotification = change.doc.data() as updatedNotificationsProps
							newNotification.id = change.doc.id
							const addedByUser = await fetchUserData(newNotification.addedBy)
							if (addedByUser) {
								newNotification.user = addedByUser
							}
							setNotificationsData(prevState => {
								const exists = prevState.some(notification => notification.id === newNotification.id)
								return exists ? prevState : [...prevState, newNotification]
							})
						}
					}
				}
			)
			return () => unsubscribe()
		}
	}, [userId, isInitialLoad])

	useEffect(() => {
		if (userId) {
			const unsubscribe = onSnapshot(
				query(collection(db, 'users', userId, 'notifications')),
				async (snapshot: QuerySnapshot) => {
					for (const change of snapshot.docChanges()) {
						if (change.type === 'removed') {
							setNotificationsData(prevNotificationsData =>
								prevNotificationsData.filter(notification => notification.id !== change.doc.id)
							)
						} else if (change.type === 'modified') {
							const newNotificationData = change.doc.data() as updatedNotificationsProps
							newNotificationData.id = change.doc.id
							const addedByUser = await fetchUserData(newNotificationData.addedBy)
							if (addedByUser) {
								newNotificationData.user = addedByUser
							}
							setNotificationsData(prevNotificationsData =>
								prevNotificationsData.map(notification =>
									notification.id === newNotificationData.id ? newNotificationData : notification
								)
							)
						}
					}
				}
			)
			return () => unsubscribe()
		}
	}, [userId])

	const value: NotificationsContextProps = {
		notificationsData,
		activeNotifications,
		newFollows,
		newComments,
		newLikes,
	}

	return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
